import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { audit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { authorizeChild, canPerform } from "@/lib/permissions";
import { questionnaireCandidates } from "@/features/child-understanding/engine";
import { findQuestion, QUESTIONNAIRE, type Question } from "@/features/questionnaires/definition";
import type { saveQuestionnaireSchema } from "@/server/validators";
import { multiAnswer } from "@/server/validators";
import { applyCandidates } from "./profile";
import { notifyChildTeachers } from "./notifications";

type Answers = Record<string, unknown>;

/** Validate one answer against its question definition; returns the normalized value or null to clear. */
export function normalizeAnswer(q: Question, value: unknown): Prisma.InputJsonValue | null {
  switch (q.type) {
    case "text":
    case "textarea": {
      if (typeof value !== "string") throw new AppError("VALIDATION", `Answer for ${q.key} must be text`);
      const v = value.trim();
      return v.length ? v.slice(0, 4000) : null;
    }
    case "single": {
      if (value === "" || value === null) return null;
      if (typeof value !== "string" || !q.options.some((o) => o.key === value)) {
        throw new AppError("VALIDATION", `Invalid option for ${q.key}`);
      }
      return value;
    }
    case "multi": {
      const parsed = multiAnswer.safeParse(value);
      if (!parsed.success) throw new AppError("VALIDATION", `Invalid answer for ${q.key}`);
      const allowed = new Set([...q.options.map((o) => o.key), ...(q.allowOther ? ["other"] : [])]);
      const selected = [...new Set(parsed.data.selected)].filter((s) => allowed.has(s));
      const other = q.allowOther && selected.includes("other") ? parsed.data.other : null;
      if (selected.length === 0 && !other) return null;
      return { selected, other: other ?? null };
    }
    case "grid": {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("VALIDATION", `Invalid answer for ${q.key}`);
      const rows = new Set(q.rows.map((r) => r.key));
      const levels = new Set(q.levels.map((l) => l.key));
      const out: Record<string, string> = {};
      for (const [row, level] of Object.entries(value as Record<string, unknown>)) {
        if (rows.has(row) && typeof level === "string" && levels.has(level)) out[row] = level;
      }
      return Object.keys(out).length ? out : null;
    }
  }
}

function toMap(responses: { questionKey: string; value: Prisma.JsonValue }[]): Answers {
  return Object.fromEntries(responses.map((r) => [r.questionKey, r.value]));
}

/** Parent: their own questionnaire for the child (resume state). */
export async function getOwnQuestionnaire(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "parentContribute");
  const q = await db.parentQuestionnaire.findFirst({
    where: { childId: child.id, parentId: actor.userId },
    include: { responses: true },
    orderBy: { createdAt: "desc" },
  });
  return { child, questionnaire: q, answers: q ? toMap(q.responses) : {} };
}

/**
 * Staff view of parent questionnaires. Sensitive (health/family) answers are
 * included only for roles allowed to view them, and that access is audited.
 */
export async function listQuestionnairesForStaff(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "viewInternal");
  const includeSensitive = canPerform(actor.role, "viewSensitive");
  const list = await db.parentQuestionnaire.findMany({
    where: { childId: child.id },
    include: { responses: { where: includeSensitive ? {} : { isSensitive: false } } },
    orderBy: { updatedAt: "desc" },
  });
  if (includeSensitive && list.some((q) => q.responses.some((r) => r.isSensitive))) {
    await audit(actor, "questionnaire.sensitive_view", "Child", child.id, { questionnaires: list.length });
  }
  const parents = await db.user.findMany({ where: { id: { in: list.map((q) => q.parentId) } }, select: { id: true, name: true } });
  return list.map((q) => ({
    id: q.id,
    status: q.status,
    submittedAt: q.submittedAt,
    updatedAt: q.updatedAt,
    parentName: parents.find((p) => p.id === q.parentId)?.name ?? "",
    answers: toMap(q.responses.filter((r) => !r.isSensitive)),
    sensitiveAnswers: includeSensitive ? toMap(q.responses.filter((r) => r.isSensitive)) : null,
  }));
}

export async function saveQuestionnaire(actor: Actor, childId: string, input: z.infer<typeof saveQuestionnaireSchema>) {
  const child = await authorizeChild(db, actor, childId, "parentContribute");

  const normalized: { key: string; section: string; value: Prisma.InputJsonValue | null; sensitive: boolean }[] = [];
  for (const [key, value] of Object.entries(input.answers)) {
    const found = findQuestion(key);
    if (!found) throw new AppError("VALIDATION", `Unknown question: ${key}`);
    const { question, section } = found;
    normalized.push({
      key,
      section: section.key,
      value: normalizeAnswer(question, value),
      sensitive: "sensitive" in question && !!question.sensitive,
    });
  }
  if (input.currentSection && !QUESTIONNAIRE.some((s) => s.key === input.currentSection)) {
    throw new AppError("VALIDATION", "Unknown section");
  }

  const result = await db.$transaction(async (tx) => {
    let q = await tx.parentQuestionnaire.findFirst({ where: { childId: child.id, parentId: actor.userId }, orderBy: { createdAt: "desc" } });
    const isNew = !q;
    if (!q) {
      q = await tx.parentQuestionnaire.create({
        data: { organizationId: child.organizationId, childId: child.id, parentId: actor.userId },
      });
    }
    for (const n of normalized) {
      if (n.value === null) {
        await tx.parentResponse.deleteMany({ where: { questionnaireId: q.id, questionKey: n.key } });
      } else {
        await tx.parentResponse.upsert({
          where: { questionnaireId_questionKey: { questionnaireId: q.id, questionKey: n.key } },
          create: { questionnaireId: q.id, section: n.section, questionKey: n.key, value: n.value, isSensitive: n.sensitive },
          update: { value: n.value, isSensitive: n.sensitive },
        });
      }
    }
    const alreadySubmitted = q.status === "SUBMITTED";
    q = await tx.parentQuestionnaire.update({
      where: { id: q.id },
      data: {
        currentSection: input.currentSection ?? q.currentSection,
        ...(input.submit ? { status: "SUBMITTED", submittedAt: q.submittedAt ?? new Date() } : {}),
      },
    });

    let profileUpdates = 0;
    if (input.submit) {
      // Only non-sensitive answers feed the profile engine.
      const responses = await tx.parentResponse.findMany({ where: { questionnaireId: q.id, isSensitive: false } });
      const candidates = questionnaireCandidates(toMap(responses));
      const touched = await applyCandidates(tx, {
        organizationId: child.organizationId,
        childId: child.id,
        candidates,
        sourceType: "PARENT_QUESTIONNAIRE",
        sourceId: q.id,
        authorId: actor.userId,
        pending: false,
      });
      profileUpdates = touched.length;
      await audit(actor, "questionnaire.submit", "ParentQuestionnaire", q.id, { childId: child.id, resubmission: alreadySubmitted, profileUpdates }, tx);
      if (!alreadySubmitted) {
        await notifyChildTeachers(tx, child.id, {
          organizationId: child.organizationId,
          type: "questionnaire_submitted",
          title: "questionnaire_submitted",
          link: `/teacher/children/${child.id}/parent`,
        });
      }
    } else {
      await audit(actor, "questionnaire.save", "ParentQuestionnaire", q.id, { childId: child.id, answers: normalized.length }, tx);
    }
    return { questionnaire: q, isNew, profileUpdates };
  });

  if (result.isNew) await track("questionnaire_started", child.organizationId);
  if (input.submit) await track("questionnaire_submitted", child.organizationId, { sectionCount: QUESTIONNAIRE.length });
  return result;
}

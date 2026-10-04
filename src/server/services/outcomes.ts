import type { OutcomeResult } from "@prisma/client";
import type { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { audit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { authorizeChild, authorizeGoal } from "@/lib/permissions";
import { startOfWeek } from "@/lib/utils";
import { isKnownValue } from "@/features/child-understanding/vocabulary";
import type { outcomeSchema } from "@/server/validators";
import { applyCandidates } from "./profile";

export async function recordOutcome(actor: Actor, goalId: string, input: z.infer<typeof outcomeSchema>) {
  const { goal, child } = await authorizeGoal(db, actor, goalId, "plan");
  if (input.support && !isKnownValue("SUPPORT", input.support)) throw new AppError("VALIDATION", "Unknown support");
  if (input.contentId) {
    const c = await db.contentAsset.findFirst({ where: { id: input.contentId, childId: child.id } });
    if (!c) throw notFound("Content");
  }
  if (input.observationId) {
    const o = await db.observation.findFirst({ where: { id: input.observationId, childId: child.id } });
    if (!o) throw notFound("Observation");
  }

  // Duplicate-submission guard (double tap): identical outcome within 10 seconds.
  const recentDuplicate = await db.outcome.findFirst({
    where: {
      goalId,
      recordedById: actor.userId,
      result: input.result,
      recordedAt: { gte: new Date(Date.now() - 10_000) },
      intervention: input.contentId ? { contentId: input.contentId } : undefined,
    },
  });
  if (recentDuplicate) return { outcome: recentDuplicate, duplicate: true };

  const outcome = await db.$transaction(async (tx) => {
    const intervention = await tx.intervention.create({
      data: {
        organizationId: child.organizationId,
        childId: child.id,
        goalId,
        contentId: input.contentId ?? null,
        support: input.support ?? null,
        description: input.contentId ? "content_use" : input.support ? "support_use" : "goal_practice",
        createdById: actor.userId,
      },
    });
    const created = await tx.outcome.create({
      data: {
        organizationId: child.organizationId,
        childId: child.id,
        goalId,
        interventionId: intervention.id,
        result: input.result,
        note: input.note,
        context: input.context ?? null,
        durationMinutes: input.durationMinutes ?? null,
        observationId: input.observationId ?? null,
        recordedById: actor.userId,
      },
    });
    // A support that helped is direct evidence for the profile.
    if (input.support && (input.result === "HELPED" || input.result === "PARTLY_HELPED")) {
      await applyCandidates(tx, {
        organizationId: child.organizationId,
        childId: child.id,
        candidates: [{ category: "SUPPORT", value: input.support }],
        sourceType: "OUTCOME",
        sourceId: created.id,
        authorId: actor.userId,
        pending: false,
      });
    }
    await audit(actor, "outcome.record", "Outcome", created.id, { goalId: goal.id, result: input.result, withContent: !!input.contentId }, tx);
    return created;
  });
  await track("outcome_recorded", child.organizationId, { result: input.result });
  return { outcome, duplicate: false };
}

const RESULTS: OutcomeResult[] = ["HELPED", "PARTLY_HELPED", "DID_NOT_HELP", "NOT_OBSERVED"];

/**
 * Educational progress summary. Deliberately simple and factual: counts and
 * a weekly timeline of teacher-recorded outcomes. No percentiles, no norms.
 */
export async function getProgress(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "viewInternal");
  const goals = await db.goal.findMany({
    where: { childId: child.id },
    include: {
      outcomes: { orderBy: { recordedAt: "asc" }, include: { intervention: { select: { contentId: true, support: true } } } },
      content: { select: { id: true, title: true, type: true, status: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const observations = await db.observation.findMany({
    where: { childId: child.id },
    select: { id: true, observedAt: true, supportsTried: true, supportOutcome: true, context: true, kind: true },
    orderBy: { observedAt: "asc" },
  });

  const supportStats = new Map<string, { tried: number; helped: number; partly: number; notHelped: number }>();
  for (const o of observations) {
    for (const s of o.supportsTried) {
      const st = supportStats.get(s) ?? { tried: 0, helped: 0, partly: 0, notHelped: 0 };
      st.tried++;
      if (o.supportOutcome === "helped") st.helped++;
      if (o.supportOutcome === "partly_helped") st.partly++;
      if (o.supportOutcome === "did_not_help") st.notHelped++;
      supportStats.set(s, st);
    }
  }
  for (const g of goals) {
    for (const o of g.outcomes) {
      const s = o.intervention?.support;
      if (!s) continue;
      const st = supportStats.get(s) ?? { tried: 0, helped: 0, partly: 0, notHelped: 0 };
      st.tried++;
      if (o.result === "HELPED") st.helped++;
      if (o.result === "PARTLY_HELPED") st.partly++;
      if (o.result === "DID_NOT_HELP") st.notHelped++;
      supportStats.set(s, st);
    }
  }

  const goalSummaries = goals.map((g) => {
    const counts = Object.fromEntries(RESULTS.map((r) => [r, g.outcomes.filter((o) => o.result === r).length])) as Record<OutcomeResult, number>;
    const weeks = new Map<string, Record<OutcomeResult, number>>();
    for (const o of g.outcomes) {
      const key = startOfWeek(o.recordedAt).toISOString().slice(0, 10);
      const w = weeks.get(key) ?? { HELPED: 0, PARTLY_HELPED: 0, DID_NOT_HELP: 0, NOT_OBSERVED: 0 };
      w[o.result]++;
      weeks.set(key, w);
    }
    const lastFive = g.outcomes.filter((o) => o.result !== "NOT_OBSERVED").slice(-5);
    const contentUsed = new Set(g.outcomes.map((o) => o.intervention?.contentId).filter(Boolean));
    return {
      id: g.id,
      statement: g.statement,
      successIndicator: g.successIndicator,
      domain: g.domain,
      status: g.status,
      startDate: g.startDate,
      reviewDate: g.reviewDate,
      counts,
      timeline: [...weeks.entries()].map(([week, c]) => ({ week, ...c })),
      recentHelped: lastFive.filter((o) => o.result === "HELPED").length,
      recentTotal: lastFive.length,
      outcomes: g.outcomes
        .slice(-10)
        .reverse()
        .map((o) => ({ id: o.id, result: o.result, note: o.note, context: o.context, recordedAt: o.recordedAt, contentId: o.intervention?.contentId ?? null })),
      content: g.content.map((c) => ({ ...c, used: contentUsed.has(c.id) })),
      hasOutcomeBeforeReview: g.outcomes.some((o) => o.recordedAt <= g.reviewDate),
    };
  });

  return {
    child,
    goals: goalSummaries,
    supports: [...supportStats.entries()].map(([support, s]) => ({ support, ...s })).sort((a, b) => b.helped - a.helped || b.tried - a.tried),
    observationCount: observations.length,
    observationsByMonth: Object.entries(
      observations.reduce<Record<string, number>>((acc, o) => {
        const k = o.observedAt.toISOString().slice(0, 7);
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([month, count]) => ({ month, count })),
  };
}

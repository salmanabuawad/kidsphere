import type { AttributeCategory, AttributeStatus, EvidenceSource, ProfileAttribute } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { audit } from "@/lib/audit";
import { db, type Tx } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { authorizeChild } from "@/lib/permissions";
import { aiTimeoutMs, resolveProvider } from "@/lib/ai";
import { attributeSuggestionSchema, toProviderJsonSchema } from "@/lib/ai/schemas";
import { SUGGEST_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { type Candidate, computeConfidence, nextStatus } from "@/features/child-understanding/engine";
import { isKnownValue, VOCABULARY } from "@/features/child-understanding/vocabulary";

type ApplyInput = {
  organizationId: string;
  childId: string;
  candidates: Candidate[];
  sourceType: EvidenceSource;
  sourceId: string;
  authorId: string | null;
  /** Pending evidence (possible pattern / AI suggestion) never activates an attribute by itself. */
  pending: boolean;
  note?: string | null;
};

/**
 * Deterministic profile update. For each candidate: upsert the attribute,
 * attach provenance (idempotent per source), then recompute status/confidence
 * from the full evidence set.
 */
export async function applyCandidates(tx: Tx, input: ApplyInput): Promise<ProfileAttribute[]> {
  const touched: ProfileAttribute[] = [];
  for (const c of input.candidates) {
    if (!isKnownValue(c.category, c.value)) continue;
    const existing = await tx.profileAttribute.findUnique({
      where: { childId_category_value: { childId: input.childId, category: c.category, value: c.value } },
    });
    const status = nextStatus(existing?.status ?? null, { sourceType: input.sourceType, pending: input.pending });
    const attr =
      existing ??
      (await tx.profileAttribute.create({
        data: {
          organizationId: input.organizationId,
          childId: input.childId,
          category: c.category,
          value: c.value,
          status,
          confidence: input.pending ? "EMERGING" : "REPORTED",
        },
      }));
    await tx.profileAttributeEvidence.upsert({
      where: { attributeId_sourceType_sourceId: { attributeId: attr.id, sourceType: input.sourceType, sourceId: input.sourceId } },
      create: { attributeId: attr.id, sourceType: input.sourceType, sourceId: input.sourceId, authorId: input.authorId, note: input.note ?? null },
      update: {},
    });
    touched.push(await recompute(tx, attr.id, status));
  }
  return touched;
}

async function recompute(tx: Tx, attributeId: string, status: AttributeStatus): Promise<ProfileAttribute> {
  const evidence = await tx.profileAttributeEvidence.findMany({ where: { attributeId } });
  return tx.profileAttribute.update({
    where: { id: attributeId },
    data: { status, confidence: computeConfidence(evidence, status) },
  });
}

export type ProfileEvidenceView = {
  id: string;
  sourceType: EvidenceSource;
  sourceId: string;
  label: string | null;
  date: Date;
  note: string | null;
};

export type ProfileAttributeView = ProfileAttribute & { evidence: ProfileEvidenceView[] };

/** Staff profile with full provenance (who/what/when for every attribute). */
export async function getInternalProfile(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "viewInternal");
  const attrs = await db.profileAttribute.findMany({
    where: { childId: child.id },
    include: { evidence: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });

  const idsOf = (type: EvidenceSource) => attrs.flatMap((a) => a.evidence.filter((e) => e.sourceType === type).map((e) => e.sourceId));
  const [obs, qs, outs] = await Promise.all([
    db.observation.findMany({ where: { id: { in: idsOf("TEACHER_OBSERVATION") }, childId }, select: { id: true, observedAt: true, context: true } }),
    db.parentQuestionnaire.findMany({
      where: { id: { in: idsOf("PARENT_QUESTIONNAIRE") }, childId },
      select: { id: true, submittedAt: true, updatedAt: true },
    }),
    db.outcome.findMany({ where: { id: { in: idsOf("OUTCOME") }, childId }, select: { id: true, recordedAt: true, result: true } }),
  ]);
  const obsMap = new Map(obs.map((o) => [o.id, o]));
  const qMap = new Map(qs.map((q) => [q.id, q]));
  const outMap = new Map(outs.map((o) => [o.id, o]));

  const attributes: ProfileAttributeView[] = attrs.map((a) => ({
    ...a,
    evidence: a.evidence.map((e) => {
      let date = e.createdAt;
      let label: string | null = null;
      if (e.sourceType === "TEACHER_OBSERVATION") {
        const o = obsMap.get(e.sourceId);
        if (o) {
          date = o.observedAt;
          label = o.context;
        }
      } else if (e.sourceType === "PARENT_QUESTIONNAIRE") {
        const q = qMap.get(e.sourceId);
        if (q) date = q.submittedAt ?? q.updatedAt;
      } else if (e.sourceType === "OUTCOME") {
        const o = outMap.get(e.sourceId);
        if (o) {
          date = o.recordedAt;
          label = o.result;
        }
      }
      return { id: e.id, sourceType: e.sourceType, sourceId: e.sourceId, label, date, note: e.note };
    }),
  }));
  return { child, attributes };
}

/** Parent-facing profile: active, positive items only, no inference labels. */
export async function getParentProfile(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "view");
  const attrs = await db.profileAttribute.findMany({
    where: { childId: child.id, status: "ACTIVE", category: { in: ["STRENGTH", "INTEREST", "SUPPORT"] } },
    select: { category: true, value: true },
  });
  return {
    child,
    strengths: attrs.filter((a) => a.category === "STRENGTH").map((a) => a.value),
    interests: attrs.filter((a) => a.category === "INTEREST").map((a) => a.value),
    supports: attrs.filter((a) => a.category === "SUPPORT").map((a) => a.value),
  };
}

async function loadAttribute(actor: Actor, childId: string, attributeId: string) {
  await authorizeChild(db, actor, childId, "observe");
  const attr = await db.profileAttribute.findFirst({ where: { id: attributeId, childId } });
  if (!attr) throw notFound("Profile attribute");
  return attr;
}

/** Teacher confirmation: the only path by which an EMERGING attribute becomes usable. */
export async function confirmAttribute(actor: Actor, childId: string, attributeId: string, note?: string | null) {
  const attr = await loadAttribute(actor, childId, attributeId);
  return db.$transaction(async (tx) => {
    const sourceId = `confirm:${actor.userId}`;
    await tx.profileAttributeEvidence.upsert({
      where: { attributeId_sourceType_sourceId: { attributeId, sourceType: "TEACHER_ENTRY", sourceId } },
      create: { attributeId, sourceType: "TEACHER_ENTRY", sourceId, authorId: actor.userId, note: note ?? null },
      update: {},
    });
    const updated = await recompute(tx, attributeId, "ACTIVE");
    const final = await tx.profileAttribute.update({
      where: { id: attributeId },
      data: { confirmedById: actor.userId, confirmedAt: new Date(), retiredAt: null },
    });
    await audit(
      actor,
      "profile_attribute.confirm",
      "ProfileAttribute",
      attributeId,
      { category: attr.category, from: attr.status, confidence: updated.confidence },
      tx,
    );
    return final;
  });
}

export async function retireAttribute(actor: Actor, childId: string, attributeId: string) {
  const attr = await loadAttribute(actor, childId, attributeId);
  const status: AttributeStatus = attr.status === "PENDING_CONFIRMATION" ? "REJECTED" : "RETIRED";
  return db.$transaction(async (tx) => {
    const updated = await tx.profileAttribute.update({
      where: { id: attributeId },
      data: { status, confidence: "RETIRED", retiredAt: new Date() },
    });
    await audit(
      actor,
      status === "REJECTED" ? "profile_attribute.reject" : "profile_attribute.retire",
      "ProfileAttribute",
      attributeId,
      { category: attr.category },
      tx,
    );
    return updated;
  });
}

/** Teacher adds a known attribute directly (REPORTED by the teacher). */
export async function addTeacherAttribute(actor: Actor, childId: string, category: AttributeCategory, value: string, note?: string | null) {
  const child = await authorizeChild(db, actor, childId, "observe");
  if (!isKnownValue(category, value)) throw new AppError("VALIDATION", "Unknown profile value");
  return db.$transaction(async (tx) => {
    const [attr] = await applyCandidates(tx, {
      organizationId: child.organizationId,
      childId,
      candidates: [{ category, value }],
      sourceType: "TEACHER_ENTRY",
      sourceId: `entry:${actor.userId}:${category}:${value}`,
      authorId: actor.userId,
      pending: false,
      note,
    });
    await audit(actor, "profile_attribute.confirm", "ProfileAttribute", attr?.id ?? null, { category, manual: true }, tx);
    return attr;
  });
}

/**
 * Ask the AI provider to SUGGEST attributes from one observation. Only the
 * observation's factual text and context are sent (child name masked). The
 * result is stored as pending/EMERGING — never active — until a teacher confirms.
 */
export async function suggestAttributesFromObservation(actor: Actor, childId: string, observationId: string) {
  const child = await authorizeChild(db, actor, childId, "observe");
  const obs = await db.observation.findFirst({ where: { id: observationId, childId } });
  if (!obs) throw notFound("Observation");
  const org = await db.organization.findUnique({ where: { id: child.organizationId } });
  if (org && !org.aiEnabled) throw new AppError("AI_UNAVAILABLE", "AI features are turned off for your organization.");

  const masked = [child.firstName, child.displayName, child.lastName]
    .filter((n): n is string => !!n && n.length > 1)
    .reduce((text, name) => text.replaceAll(name, "the child"), obs.observedBehavior);
  const categories = ["INTEREST", "STRENGTH", "SUPPORT", "TRIGGER", "SENSORY", "LEARNING_PREFERENCE"] as const;
  const allowed = Object.fromEntries(categories.map((c) => [c, VOCABULARY[c].map((v) => v.key)]));

  const provider = resolveProvider(org?.aiProvider);
  const started = Date.now();
  try {
    const result = await provider.generateStructuredContent({
      operation: "suggest_attributes",
      system: SUGGEST_SYSTEM_PROMPT,
      prompt: `Observation context: ${obs.context}\nSupports tried: ${obs.supportsTried.join(", ") || "none"}\nObservation: ${masked}\n\nAllowed keys per category (JSON): ${JSON.stringify(allowed)}`,
      schema: attributeSuggestionSchema,
      jsonSchema: toProviderJsonSchema(attributeSuggestionSchema),
      input: { op: "suggest", text: masked },
      validate: (v) => v.suggestions.filter((s) => !isKnownValue(s.category, s.value)).map((s) => `unknown key ${s.category}:${s.value}`),
      timeoutMs: aiTimeoutMs(),
    });
    const attributes = await db.$transaction(async (tx) => {
      const attrs = await applyCandidates(tx, {
        organizationId: child.organizationId,
        childId,
        candidates: result.value.suggestions.map((s) => ({ category: s.category, value: s.value })),
        sourceType: "AI_SUGGESTION",
        sourceId: observationId,
        authorId: null,
        pending: true,
      });
      await tx.aIRequestLog.create({
        data: {
          organizationId: child.organizationId,
          actorId: actor.userId,
          provider: result.provider,
          model: result.model,
          operation: "suggest_attributes",
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: result.durationMs,
          success: true,
          repaired: result.repaired,
        },
      });
      return attrs;
    });
    return { suggestions: result.value.suggestions, attributes };
  } catch (e) {
    await db.aIRequestLog.create({
      data: {
        organizationId: child.organizationId,
        actorId: actor.userId,
        provider: provider.name,
        model: provider.model,
        operation: "suggest_attributes",
        durationMs: Date.now() - started,
        success: false,
        errorCode: e instanceof AppError ? e.code : "INTERNAL",
      },
    });
    throw e;
  }
}

import type { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { audit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { db } from "@/lib/db";
import { authorizeChild } from "@/lib/permissions";
import { addDays } from "@/lib/utils";
import { observationCandidates, PERSISTENT_CONCERN_THRESHOLD } from "@/features/child-understanding/engine";
import type { ObservationInput } from "@/server/validators";
import { applyCandidates } from "./profile";

export async function createObservation(actor: Actor, childId: string, input: ObservationInput) {
  const child = await authorizeChild(db, actor, childId, "observe");

  // Duplicate-submission guard: the same client request id returns the existing record.
  if (input.clientRequestId) {
    const existing = await db.observation.findFirst({
      where: { childId, authorId: actor.userId, details: { path: ["clientRequestId"], equals: input.clientRequestId } },
    });
    if (existing) return { observation: existing, profileUpdates: [], duplicate: true };
  }

  const isQuick = input.kind === "QUICK";
  const domains = isQuick ? input.domains : [...new Set(input.items.map((i) => i.domain))];
  const supports = input.supportsTried;
  const details: Prisma.InputJsonObject = {
    clientRequestId: input.clientRequestId ?? null,
    ...(isQuick
      ? { antecedentTags: input.antecedentTags, customSupport: input.customSupport ?? null, interestTags: input.interestTags, strengthTags: input.strengthTags }
      : {
          sensory: input.sensory ?? null,
          participation: (input.participation ?? null) as Prisma.InputJsonValue | null,
          interestTags: input.interestTags,
          strengthTags: input.strengthTags,
        }),
    possiblePatterns: input.possiblePatterns,
  };

  const result = await db.$transaction(async (tx) => {
    const observation = await tx.observation.create({
      data: {
        organizationId: child.organizationId,
        childId,
        authorId: actor.userId,
        kind: input.kind,
        context: input.context,
        observedAt: input.observedAt ?? new Date(),
        observedBehavior: input.observedBehavior,
        frequencyOrDuration: isQuick ? input.frequencyOrDuration : null,
        whatHappenedBefore: isQuick ? input.whatHappenedBefore : null,
        supportsTried: supports,
        supportOutcome: input.outcome,
        strengthNoticed: input.strengthNoticed,
        teacherNote: input.teacherNote,
        possiblePattern: input.possiblePatterns.length ? input.possiblePatterns.map((p) => `${p.category}:${p.value}`).join(",") : null,
        details,
        domains: { create: domains.map((domain) => ({ domain })) },
        items: isQuick
          ? undefined
          : { create: input.items.map((i) => ({ domain: i.domain, itemKey: `${i.domain}.${i.itemKey}`, rating: i.rating, note: i.note })) },
      },
    });

    const { direct, pending } = observationCandidates({
      supportsTried: input.supportsTried,
      outcome: input.outcome,
      strengthTags: input.strengthTags,
      interestTags: input.interestTags,
      antecedentTags: isQuick ? input.antecedentTags : [],
      possiblePatterns: input.possiblePatterns,
    });
    const base = {
      organizationId: child.organizationId,
      childId,
      sourceType: "TEACHER_OBSERVATION" as const,
      sourceId: observation.id,
      authorId: actor.userId,
    };
    const updated = [
      ...(await applyCandidates(tx, { ...base, candidates: direct, pending: false })),
      ...(await applyCandidates(tx, { ...base, candidates: pending, pending: true, note: "possible_pattern" })),
    ];
    await audit(actor, "observation.create", "Observation", observation.id, { childId, kind: input.kind, context: input.context, domains: domains.length }, tx);
    return { observation, profileUpdates: updated, duplicate: false };
  });

  await track("observation_created", child.organizationId, {
    kind: input.kind,
    durationSeconds: "entrySeconds" in input ? (input.entrySeconds ?? null) : null,
  });
  return result;
}

export async function listObservations(actor: Actor, childId: string, take = 50) {
  await authorizeChild(db, actor, childId, "viewInternal");
  const list = await db.observation.findMany({
    where: { childId },
    include: { domains: true, items: true },
    orderBy: { observedAt: "desc" },
    take,
  });
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(list.map((o) => o.authorId))] } }, select: { id: true, name: true } });
  return list.map((o) => ({ ...o, authorName: authors.find((a) => a.id === o.authorId)?.name ?? "" }));
}

/**
 * Neutral, procedural note when the same context keeps recurring with
 * unhelped support. Never names a condition, never computes a probability.
 */
export async function shouldShowProfessionalTeamNote(childId: string): Promise<boolean> {
  const recent = await db.observation.count({
    where: { childId, observedAt: { gte: addDays(new Date(), -30) }, supportOutcome: "did_not_help" },
  });
  return recent >= PERSISTENT_CONCERN_THRESHOLD;
}

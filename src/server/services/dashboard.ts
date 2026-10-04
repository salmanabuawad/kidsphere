import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { childScopeWhere, classScopeWhere, orgScope } from "@/lib/permissions";
import { addDays, startOfWeek } from "@/lib/utils";
import { providerStatuses } from "@/lib/ai";

export async function teacherDashboard(actor: Actor) {
  const scope = childScopeWhere(actor);
  const now = new Date();
  const twoWeeksAgo = addDays(now, -14);
  const weekStart = startOfWeek(now);

  const [children, reviewGoals, drafts, planItems, improved, unreadMessages, newQuestionnaires] = await Promise.all([
    db.child.findMany({
      where: { AND: [{ archivedAt: null }, scope] },
      select: {
        id: true,
        displayName: true,
        avatarColor: true,
        observations: { orderBy: { observedAt: "desc" }, take: 1, select: { observedAt: true } },
        _count: { select: { attributes: { where: { status: "PENDING_CONFIRMATION" } } } },
      },
      orderBy: { firstName: "asc" },
    }),
    db.goal.findMany({
      where: { status: "ACTIVE", reviewDate: { lte: addDays(now, 7) }, child: scope },
      include: { child: { select: { id: true, displayName: true } }, _count: { select: { outcomes: true } } },
      orderBy: { reviewDate: "asc" },
    }),
    db.contentAsset.findMany({
      where: { status: { in: ["DRAFT", "TEACHER_REVIEW"] }, child: scope },
      include: { child: { select: { id: true, displayName: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    db.weeklyPlanItem.findMany({
      where: { plan: { weekStart, class: classScopeWhere(actor) }, child: scope },
      include: { child: { select: { id: true, displayName: true } }, content: { select: { id: true, status: true } } },
      orderBy: { dayOfWeek: "asc" },
    }),
    db.outcome.findMany({
      where: { result: "HELPED", recordedAt: { gte: twoWeeksAgo }, child: scope },
      include: { goal: { select: { id: true, statement: true } }, child: { select: { id: true, displayName: true } } },
      orderBy: { recordedAt: "desc" },
      take: 6,
    }),
    db.parentMessage.findMany({
      where: { readAt: null, child: scope },
      select: { childId: true },
    }),
    db.parentQuestionnaire.findMany({
      where: { status: "SUBMITTED", submittedAt: { gte: twoWeeksAgo }, child: scope },
      select: { childId: true },
    }),
  ]);

  const needsReview = children
    .map((c) => ({
      id: c.id,
      displayName: c.displayName,
      avatarColor: c.avatarColor,
      pending: c._count.attributes,
      messages: unreadMessages.filter((m) => m.childId === c.id).length,
      newQuestionnaire: newQuestionnaires.some((q) => q.childId === c.id),
    }))
    .filter((c) => c.pending > 0 || c.messages > 0 || c.newQuestionnaire);

  const notObservedRecently = children
    .filter((c) => !c.observations[0] || c.observations[0].observedAt < twoWeeksAgo)
    .map((c) => ({ id: c.id, displayName: c.displayName, avatarColor: c.avatarColor, lastObservedAt: c.observations[0]?.observedAt ?? null }));

  // De-duplicate improvements per goal.
  const seen = new Set<string>();
  const improvements = improved.filter((o) => (seen.has(o.goalId) ? false : (seen.add(o.goalId), true)));

  return {
    childCount: children.length,
    needsReview,
    reviewGoals: reviewGoals.map((g) => ({ ...g, overdue: g.reviewDate < now })),
    drafts,
    planItems,
    improvements,
    notObservedRecently,
  };
}

export async function adminDashboard(actor: Actor) {
  const orgId = orgScope(actor);
  const where = orgId ? { organizationId: orgId } : {};
  const since = addDays(new Date(), -30);
  const [orgs, kgs, classes, users, children, questionnaires, submitted, observations, generated, approved, ai] = await Promise.all([
    actor.role === "SUPER_ADMIN" ? db.organization.count() : Promise.resolve(1),
    db.kindergarten.count({ where }),
    db.class.count({ where }),
    db.user.groupBy({ by: ["role"], where, _count: true }),
    db.child.count({ where: { ...where, archivedAt: null } }),
    db.parentQuestionnaire.count({ where }),
    db.parentQuestionnaire.count({ where: { ...where, status: "SUBMITTED" } }),
    db.observation.count({ where: { ...where, createdAt: { gte: since } } }),
    db.contentAsset.count({ where: { ...where, createdAt: { gte: since }, versions: { some: { source: "AI_GENERATED" } } } }),
    db.contentApproval.count({ where: { action: "APPROVED", createdAt: { gte: since }, content: where } }),
    db.aIRequestLog.groupBy({ by: ["success"], where: { ...where, createdAt: { gte: since } }, _count: true }),
  ]);
  const [regenerated, quickObs, outcomesByResult, languages, types] = await Promise.all([
    db.contentVersion.count({ where: { source: "AI_REGENERATED", createdAt: { gte: since }, content: where } }),
    db.analyticsEvent.findMany({
      where: { name: "observation_created", createdAt: { gte: since }, ...(orgId ? { organizationId: orgId } : {}) },
      select: { properties: true },
    }),
    db.outcome.groupBy({ by: ["result"], where: { ...where, recordedAt: { gte: since } }, _count: true }),
    db.contentAsset.groupBy({ by: ["language"], where, _count: true }),
    db.contentAsset.groupBy({ by: ["type"], where, _count: true }),
  ]);
  const quickDurations = quickObs
    .map((e) => e.properties as { kind?: string; durationSeconds?: number | null } | null)
    .filter((p) => p?.kind === "QUICK" && typeof p.durationSeconds === "number")
    .map((p) => p!.durationSeconds!);
  return {
    counts: { orgs, kgs, classes, children, users: users.reduce((n, u) => n + u._count, 0) },
    usersByRole: users.map((u) => ({ role: u.role, count: u._count })),
    metrics: {
      questionnaireCompletion: questionnaires ? submitted / questionnaires : null,
      observations30d: observations,
      generated30d: generated,
      approved30d: approved,
      approvalRate: generated ? Math.min(1, approved / generated) : null,
      regenerations30d: regenerated,
      quickObservationUnder60s: quickDurations.length ? quickDurations.filter((s) => s <= 60).length / quickDurations.length : null,
      aiSuccess: ai.find((a) => a.success)?._count ?? 0,
      aiFailure: ai.find((a) => !a.success)?._count ?? 0,
      outcomes: outcomesByResult.map((o) => ({ result: o.result, count: o._count })),
      languages: languages.map((l) => ({ language: l.language, count: l._count })),
      contentTypes: types.map((t) => ({ type: t.type, count: t._count })),
    },
    providers: providerStatuses(),
  };
}

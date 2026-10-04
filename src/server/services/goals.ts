import type { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { audit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { db, type Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { authorizeChild, authorizeGoal } from "@/lib/permissions";
import { assertCanAddActiveGoal, becomesActive } from "@/features/goals/rules";
import type { createGoalSchema, updateGoalSchema } from "@/server/validators";

/** Serialize goal changes per child so two tabs cannot both create a 4th goal. */
async function lockChild(tx: Tx, childId: string) {
  await tx.$queryRaw`SELECT id FROM "Child" WHERE id = ${childId} FOR UPDATE`;
}

export async function createGoal(actor: Actor, childId: string, input: z.infer<typeof createGoalSchema>) {
  const child = await authorizeChild(db, actor, childId, "plan");
  const goal = await db.$transaction(async (tx) => {
    await lockChild(tx, childId);
    const active = await tx.goal.count({ where: { childId, status: "ACTIVE" } });
    assertCanAddActiveGoal(active);

    // Evidence may only reference confirmed (ACTIVE) attributes of this child:
    // EMERGING/pending attributes can never drive a goal.
    if (input.evidenceAttributeIds.length) {
      const ok = await tx.profileAttribute.count({
        where: { id: { in: input.evidenceAttributeIds }, childId, status: "ACTIVE" },
      });
      if (ok !== new Set(input.evidenceAttributeIds).size) {
        throw new AppError("VALIDATION", "Goals can only be supported by confirmed profile items.");
      }
    }

    const created = await tx.goal.create({
      data: {
        organizationId: child.organizationId,
        childId,
        teacherId: actor.userId,
        domain: input.domain,
        statement: input.statement,
        successIndicator: input.successIndicator,
        startDate: input.startDate,
        reviewDate: input.reviewDate,
        parentReinforcement: input.parentReinforcement,
        parentFocus: input.parentFocus,
        shareWithParent: input.shareWithParent,
        evidence: {
          create: [...new Set(input.evidenceAttributeIds)].map((id) => ({ sourceType: "TEACHER_ENTRY" as const, sourceId: id, note: "profile_attribute" })),
        },
      },
    });
    await audit(actor, "goal.create", "Goal", created.id, { childId, domain: input.domain }, tx);
    return created;
  });
  await track("goal_created", child.organizationId, { domain: input.domain });
  return goal;
}

/** Parents only see goals the teacher chose to share, in positive wording. */
export async function listParentGoals(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "view");
  return db.goal.findMany({
    where: { childId: child.id, status: "ACTIVE", shareWithParent: true },
    select: { id: true, parentFocus: true, parentReinforcement: true, domain: true, startDate: true },
  });
}

export async function listGoals(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "viewInternal");
  return db.goal.findMany({
    where: { childId: child.id },
    include: {
      evidence: true,
      outcomes: { orderBy: { recordedAt: "desc" }, take: 5 },
      _count: { select: { outcomes: true, content: true } },
    },
    orderBy: [{ status: "asc" }, { reviewDate: "asc" }],
  });
}

export async function updateGoal(actor: Actor, goalId: string, input: z.infer<typeof updateGoalSchema>) {
  const { goal } = await authorizeGoal(db, actor, goalId, "plan");
  return db.$transaction(async (tx) => {
    if (input.status && becomesActive(goal.status, input.status)) {
      await lockChild(tx, goal.childId);
      assertCanAddActiveGoal(await tx.goal.count({ where: { childId: goal.childId, status: "ACTIVE" } }));
    }
    const closing = input.status && input.status !== "ACTIVE" && input.status !== "PAUSED";
    const updated = await tx.goal.update({
      where: { id: goal.id },
      data: {
        statement: input.statement,
        successIndicator: input.successIndicator,
        reviewDate: input.reviewDate,
        status: input.status,
        parentReinforcement: input.parentReinforcement === undefined ? undefined : input.parentReinforcement,
        parentFocus: input.parentFocus === undefined ? undefined : input.parentFocus,
        shareWithParent: input.shareWithParent,
        closedAt: closing ? new Date() : input.status === "ACTIVE" ? null : undefined,
      },
    });
    await audit(actor, closing ? "goal.close" : "goal.update", "Goal", goal.id, { fields: Object.keys(input), status: updated.status }, tx);
    return updated;
  });
}

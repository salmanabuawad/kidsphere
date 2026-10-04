import type { GoalStatus } from "@prisma/client";
import { AppError } from "@/lib/errors";

export const MAX_ACTIVE_GOALS = 3;

/** Throws GOAL_LIMIT when adding one more active goal would exceed the limit. */
export function assertCanAddActiveGoal(currentActive: number): void {
  if (currentActive >= MAX_ACTIVE_GOALS) {
    throw new AppError("GOAL_LIMIT", `A child can have at most ${MAX_ACTIVE_GOALS} active goals. Close or pause a goal first.`);
  }
}

/** Status changes that move a goal (back) into the active set. */
export function becomesActive(from: GoalStatus, to: GoalStatus): boolean {
  return from !== "ACTIVE" && to === "ACTIVE";
}

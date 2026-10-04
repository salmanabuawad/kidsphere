"use client";

import type { GoalStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

export function GoalStatusActions({ goalId, status }: { goalId: string; status: GoalStatus }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const set = (next: GoalStatus) =>
    run(() => api(`/api/goals/${goalId}`, { method: "PATCH", body: { status: next } }), { success: t("teacher.goals.updated") });
  if (status === "ACTIVE") {
    return (
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("PAUSED")}>
          {t("teacher.goals.pause")}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("ACHIEVED")}>
          {t("teacher.goals.achieved")}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("CLOSED")}>
          {t("teacher.goals.closeGoal")}
        </Button>
      </div>
    );
  }
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("ACTIVE")}>
      {t("teacher.goals.resume")}
    </Button>
  );
}

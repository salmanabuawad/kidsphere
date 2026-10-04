import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getChild } from "@/server/services/children";
import { Alert } from "@/components/ui/feedback";
import { GoalForm } from "@/features/goals/goal-form";
import { MAX_ACTIVE_GOALS } from "@/features/goals/rules";

export default async function NewGoalPage({ params }: PageProps<"/teacher/children/[childId]/goals/new">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t } = await getI18n();
  const child = await getChild(actor, childId);
  const [activeCount, evidence] = await Promise.all([
    db.goal.count({ where: { childId: child.id, status: "ACTIVE" } }),
    // Only confirmed (ACTIVE) profile items may support a goal.
    db.profileAttribute.findMany({
      where: { childId: child.id, status: "ACTIVE", category: { in: ["SUPPORT", "TRIGGER", "STRENGTH", "INTEREST"] } },
      select: { id: true, category: true, value: true },
      orderBy: { category: "asc" },
    }),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-xl font-semibold">{t("teacher.goals.newTitle")}</h2>
      {activeCount >= MAX_ACTIVE_GOALS ? (
        <Alert tone="info">{t("teacher.goals.limitReached")}</Alert>
      ) : (
        <GoalForm childId={child.id} evidenceOptions={evidence} />
      )}
    </div>
  );
}

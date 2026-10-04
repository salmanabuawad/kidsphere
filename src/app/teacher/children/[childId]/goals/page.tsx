import { Plus, Sparkles } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { listGoals } from "@/server/services/goals";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { domainLabel } from "@/features/observations/definition";
import { MAX_ACTIVE_GOALS } from "@/features/goals/rules";
import { RecordOutcomeButton } from "@/features/goals/record-outcome";
import { GoalStatusActions } from "@/features/goals/goal-status-actions";

export default async function GoalsPage({ params }: PageProps<"/teacher/children/[childId]/goals">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t, locale } = await getI18n();
  const all = await listGoals(actor, childId);
  const active = all.filter((g) => g.status === "ACTIVE");
  const inactive = all.filter((g) => g.status !== "ACTIVE");
  const full = active.length >= MAX_ACTIVE_GOALS;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("teacher.goals.title")}</h2>
          <p className="text-muted text-sm">{t("teacher.goals.subtitle")}</p>
          <p className="mt-1 text-sm font-medium" data-testid="goal-count">
            {t("teacher.goals.limit", { n: active.length })}
          </p>
        </div>
        {!full && (
          <ButtonLink href={`/teacher/children/${childId}/goals/new`} data-testid="new-goal">
            <Plus className="size-4" />
            {t("teacher.goals.newTitle")}
          </ButtonLink>
        )}
      </div>
      {full && <Alert tone="info">{t("teacher.goals.limitReached")}</Alert>}
      {all.length === 0 && <EmptyState title={t("teacher.goals.none")} />}

      <div className="space-y-3">
        {active.map((g) => (
          <Card key={g.id} className="p-5" data-testid="active-goal">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{domainLabel(g.domain, locale)}</Badge>
              <Badge tone="green">{t(`enums.goalStatus.${g.status}`)}</Badge>
              <span className="text-muted text-xs">{t("teacher.goals.review", { date: formatDate(g.reviewDate, locale) })}</span>
              <span className="text-muted text-xs">· {t("teacher.goals.outcomes", { n: g._count.outcomes })}</span>
            </div>
            <p className="mt-2 text-lg font-medium">{g.statement}</p>
            <p className="text-muted text-sm">{g.successIndicator}</p>
            {g.shareWithParent && g.parentFocus && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">👪 {g.parentFocus}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ButtonLink href={`/teacher/studio?childId=${childId}&goalId=${g.id}`} size="sm">
                <Sparkles className="size-4" />
                {t("teacher.goals.generate")}
              </ButtonLink>
              <RecordOutcomeButton goalId={g.id} />
              <div className="ms-auto">
                <GoalStatusActions goalId={g.id} status={g.status} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {inactive.length > 0 && (
        <div>
          <h3 className="text-muted mb-2 text-sm font-semibold tracking-wide uppercase">{t("teacher.goals.inactive")}</h3>
          <div className="space-y-2">
            {inactive.map((g) => (
              <Card key={g.id} className="flex flex-wrap items-center gap-3 p-4 opacity-80">
                <Badge tone={g.status === "ACHIEVED" ? "green" : "neutral"}>{t(`enums.goalStatus.${g.status}`)}</Badge>
                <span className="min-w-0 flex-1 text-sm">{g.statement}</span>
                {!full && <GoalStatusActions goalId={g.id} status={g.status} />}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

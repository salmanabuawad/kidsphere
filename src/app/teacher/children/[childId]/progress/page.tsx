import Link from "next/link";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { getProgress } from "@/server/services/outcomes";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { VocabChip } from "@/features/child-understanding/vocab-chip";
import { RecordOutcomeButton } from "@/features/goals/record-outcome";
import { contextLabel } from "@/features/observations/definition";
import type { OutcomeResult } from "@prisma/client";

const RESULT_COLORS: Record<OutcomeResult, string> = {
  HELPED: "bg-emerald-500",
  PARTLY_HELPED: "bg-sky-400",
  DID_NOT_HELP: "bg-stone-400",
  NOT_OBSERVED: "bg-stone-200",
};

export default async function ProgressPage({ params }: PageProps<"/teacher/children/[childId]/progress">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t, locale } = await getI18n();
  const p = await getProgress(actor, childId);
  const results: OutcomeResult[] = ["HELPED", "PARTLY_HELPED", "DID_NOT_HELP", "NOT_OBSERVED"];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("teacher.progress.title")}</h2>
        <p className="text-muted text-sm">{t("teacher.progress.subtitle")}</p>
        <p className="text-muted mt-1 text-xs">{t("teacher.progress.observationCount", { n: p.observationCount })}</p>
      </div>

      {p.goals.length === 0 && <EmptyState title={t("teacher.goals.none")} />}

      {p.goals.map((g) => {
        const max = Math.max(1, ...g.timeline.map((w) => results.reduce((n, r) => n + w[r], 0)));
        return (
          <Card key={g.id}>
            <CardHeader
              title={g.statement}
              description={`${g.successIndicator} · ${t("teacher.progress.reviewOn", { date: formatDate(g.reviewDate, locale) })}`}
              action={<Badge tone={g.status === "ACTIVE" ? "green" : "neutral"}>{t(`enums.goalStatus.${g.status}`)}</Badge>}
            />
            <CardBody className="space-y-5">
              {g.status === "ACTIVE" && !g.hasOutcomeBeforeReview && <Alert tone="warning">{t("teacher.progress.needsOutcome")}</Alert>}
              <div className="flex flex-wrap gap-2">
                {results.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1.5 rounded-full bg-stone-50 px-3 py-1 text-sm">
                    <span className={`size-2.5 rounded-full ${RESULT_COLORS[r]}`} aria-hidden />
                    {t(`enums.outcome.${r}`)}: <strong>{g.counts[r]}</strong>
                  </span>
                ))}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{t("teacher.progress.timeline")}</p>
                {g.timeline.length === 0 ? (
                  <p className="text-muted text-sm">{t("teacher.child.noOutcomes")}</p>
                ) : (
                  <div className="flex items-end gap-3 overflow-x-auto pb-1" role="img" aria-label={t("teacher.progress.timeline")}>
                    {g.timeline.map((w) => (
                      <div key={w.week} className="flex w-14 shrink-0 flex-col items-center gap-1">
                        <div className="flex h-24 w-8 flex-col-reverse overflow-hidden rounded-md bg-stone-100">
                          {results.map((r) => (
                            <div
                              key={r}
                              className={RESULT_COLORS[r]}
                              style={{ height: `${(w[r] / max) * 100}%` }}
                              title={`${t(`enums.outcome.${r}`)}: ${w[r]}`}
                            />
                          ))}
                        </div>
                        <span className="text-muted text-[11px]">{formatDate(w.week, locale, { day: "numeric", month: "short" })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-medium">{t("teacher.progress.recent")}</p>
                  <ul className="space-y-2">
                    {g.outcomes.length === 0 && <li className="text-muted text-sm">{t("teacher.child.noOutcomes")}</li>}
                    {g.outcomes.map((o) => (
                      <li key={o.id} className="text-sm">
                        <span className={`me-2 inline-block size-2 rounded-full ${RESULT_COLORS[o.result]}`} aria-hidden />
                        {t(`enums.outcome.${o.result}`)} · <span className="text-muted">{formatDate(o.recordedAt, locale)}</span>
                        {o.context && <span className="text-muted"> · {contextLabel(o.context, locale)}</span>}
                        {o.note && <span className="text-muted block ps-4 text-xs">{o.note}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">{t("teacher.progress.contentUsed")}</p>
                  {g.content.length === 0 && <p className="text-muted text-sm">{t("teacher.progress.noContent")}</p>}
                  <ul className="space-y-1">
                    {g.content.map((c) => (
                      <li key={c.id}>
                        <Link href={`/teacher/content/${c.id}`} className="text-brand text-sm hover:underline" dir="auto">
                          {c.title}
                        </Link>
                        <span className="text-muted ms-2 text-xs">{t(`enums.contentStatus.${c.status}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {g.status === "ACTIVE" && <RecordOutcomeButton goalId={g.id} />}
            </CardBody>
          </Card>
        );
      })}

      <Card>
        <CardHeader title={t("teacher.progress.supports")} />
        <CardBody className="space-y-2">
          {p.supports.length === 0 && <p className="text-muted text-sm">—</p>}
          {p.supports.map((s) => (
            <div key={s.support} className="flex flex-wrap items-center gap-3">
              <VocabChip category="SUPPORT" value={s.support} locale={locale} />
              <span className="text-muted text-sm">{t("teacher.progress.tried", { n: s.tried })}</span>
              <span className="text-sm text-emerald-700">{t("teacher.progress.helpedCount", { n: s.helped })}</span>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

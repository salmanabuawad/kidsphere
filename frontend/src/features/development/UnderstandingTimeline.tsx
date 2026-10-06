import { Route } from "lucide-react";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { ProvenanceBadges } from "@/components/source";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import type { BaselineDetail, CurrentUnderstanding, Review } from "./api";

type Step = {
  key: string;
  kind: "original" | "review";
  date: string;
  by: string | null;
  text: string | null;
  current: boolean;
  aiStarted?: boolean;
  level?: string | null;
};

/**
 * "Understanding over time" (X-20, §5.8): the original baseline → each approved review → today,
 * with dates and who approved each step. Every step is kept; nothing is overwritten.
 */
export function UnderstandingTimeline({
  original,
  reviews,
  current,
}: {
  original: BaselineDetail | null;
  reviews: Review[];
  current: CurrentUnderstanding | null;
}) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { optionLabel } = useOptions();
  const ordered = [...reviews].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const currentReviewId = current?.source === "review" ? current.review_id : null;
  const steps: Step[] = [
    ...(original
      ? [{
          key: `b-${original.id}`,
          kind: "original" as const,
          date: original.created_at,
          by: original.created_by?.name ?? null,
          text: original.summary,
          current: !currentReviewId && current?.source === "baseline",
        }]
      : []),
    ...ordered.map((r) => ({
      key: `r-${r.id}`,
      kind: "review" as const,
      date: r.review_date,
      by: r.created_by?.name ?? null,
      text: r.understanding?.summary ?? r.summary,
      current: r.id === currentReviewId,
      aiStarted: r.ai_suggested,
      level: r.follow_up?.improvement?.level ?? null,
    })),
  ];
  if (!steps.length) return null;
  return (
    <Card data-testid="understanding-timeline">
      <CardHeader title={t("development.overTime.title")} description={t("development.overTime.hint")} icon={<Route className="size-4" aria-hidden />} />
      <CardBody>
        <ol className="space-y-4 border-s-2 border-line ps-4">
          {steps.map((s) => (
            <li key={s.key} data-testid="understanding-step" data-current={s.current ? "true" : "false"} className="space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                <span>{s.kind === "original" ? t("development.overTime.original") : t("development.overTime.review")}</span>
                <span className="font-normal text-ink-muted">{formatDate(s.date)}</span>
                {s.current && <Badge tone="brand">{t("development.overTime.current")}</Badge>}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                {s.kind === "review" && <ProvenanceBadges kinds={["teacher_approved"]} />}
                {s.by && <span>{s.kind === "review" ? t("development.overTime.approvedBy", { name: s.by }) : t("development.overTime.savedBy", { name: s.by })}</span>}
                {s.aiStarted && <span>· {t("development.overTime.aiStarted")}</span>}
                {s.level && <Badge tone="neutral">{optionLabel("improvement_levels", s.level)}</Badge>}
              </p>
              {s.text && (
                <p className="line-clamp-3 text-sm text-ink" dir="auto">
                  {s.text}
                </p>
              )}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

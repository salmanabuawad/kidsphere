import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ClipboardCheck, Flag, History, Lightbulb, ListChecks, Plus, Sparkles } from "lucide-react";
import { CurrentFocusIcon, DevelopmentIcon, TimelineIcon } from "@/icons";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, Chip, Dialog, EmptyState, Skeleton } from "@/components/ui";
import { pick } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { ChildLayout, ProfileItemChips, type ProfileItem } from "@/features/children";
import {
  baselinesUrl,
  baselineUrl,
  createBaseline,
  currentUnderstandingUrl,
  reviewsUrl,
  type BaselineData,
  type BaselineDetail,
  type BaselineSummary,
  type BaselinesResponse,
  type CurrentUnderstanding,
  type CurrentUnderstandingResponse,
  type Review,
  type ReviewsResponse,
  type ReviewWarning,
} from "./api";
import { BaselineCompare } from "./BaselineCompare";
import { EvidenceText, ReviewStatusBadge, Section, useEvidence, ValidationBadge } from "./parts";
import { SummaryCard } from "./SummaryCard";
import { UnderstandingTimeline } from "./UnderstandingTimeline";

/**
 * /children/:id/development — the initial baseline next to the current
 * understanding (stacked on phones), how the understanding developed (original
 * baseline → each approved review → today), the short functional summary (Domain 17),
 * the original-vs-latest baseline viewer, how the first picture holds up (latest
 * review) and past reviews. Descriptive only: no charts, no scores (spec §22–26).
 */
export function DevelopmentPage() {
  const { id = "" } = useParams();
  return (
    <ChildLayout childId={id}>
      <Development childId={id} />
    </ChildLayout>
  );
}

function Development({ childId }: { childId: string }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const location = useLocation();
  const navigate = useNavigate();
  const cu = useFetch<CurrentUnderstandingResponse>(currentUnderstandingUrl(childId));
  const baselines = useFetch<BaselinesResponse>(baselinesUrl(childId));
  const reviews = useFetch<ReviewsResponse>(reviewsUrl(childId));
  const { pending, run } = useAction();
  const [confirming, setConfirming] = useState(false);
  const saved = (location.state as { warnings?: ReviewWarning[] } | null)?.warnings ?? [];
  const warnings = saved.filter((w) => w.code === "LIMITED_OBSERVATIONS");
  const wording = saved.some((w) => w.code === "WORDING");
  const originalId = baselines.data?.original_id ?? null;
  const original = useFetch<{ baseline: BaselineDetail }>(originalId ? baselineUrl(childId, originalId) : null);

  async function newBaseline() {
    const r = await run(() => createBaseline(childId), { success: t("development.baseline.createdToast") });
    if (r.ok) {
      setConfirming(false);
      cu.reload();
      baselines.reload();
      reviews.reload();
    }
  }

  const error = cu.error ?? reviews.error;
  if (error)
    return (
      <Alert
        tone="error"
        action={
          <Button size="sm" variant="outline" onClick={() => (cu.error ? cu.reload() : reviews.reload())}>
            {t("common.retry")}
          </Button>
        }
      >
        {toMessage(error)}
      </Alert>
    );

  const baseline = cu.data?.baseline ?? null;
  const latest = reviews.data?.reviews[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-title flex items-center gap-3 font-semibold text-ink">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-tray">
              <DevelopmentIcon className="size-5" />
            </span>
            {t("development.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t("development.intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={paths.newReview(childId)} icon={<ClipboardCheck className="size-4" aria-hidden />}>
            {t("development.actions.review")}
          </ButtonLink>
          <Button variant="outline" icon={<Flag className="size-4" aria-hidden />} disabled={!cu.data} onClick={() => setConfirming(true)}>
            {baseline ? t("development.actions.newBaseline") : t("development.actions.firstBaseline")}
          </Button>
          <ButtonLink variant="ghost" to={paths.childDevelopmentTimeline(childId)} icon={<TimelineIcon className="size-4" paint={false} aria-hidden />}>
            {t("development.actions.timeline")}
          </ButtonLink>
        </div>
      </div>

      {warnings.length > 0 && <SavedWarnings warnings={warnings} onClose={() => navigate(".", { replace: true, state: null })} />}
      {wording && <Alert tone="warning">{t("development.review.wordingSaved")}</Alert>}

      {!cu.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <BaselineCard
            baseline={baseline}
            earlier={baselines.data?.earlier ?? []}
            summaryText={reviews.data?.context.baseline?.id === baseline?.id ? reviews.data?.context.baseline?.summary : null}
          />
          <UnderstandingCard understanding={cu.data.current_understanding} />
        </div>
      )}

      {cu.data && reviews.data && (
        <UnderstandingTimeline original={original.data?.baseline ?? null} reviews={reviews.data.reviews} current={cu.data.current_understanding} />
      )}

      <SummaryCard childId={childId} />

      {original.data && baselines.data?.latest && !baselines.data.latest.original && (
        <BaselineCompare
          original={original.data.baseline}
          latest={(baselines.data.latest.baseline_data ?? {}) as BaselineData}
          latestDate={baselines.data.latest.created_at}
        />
      )}

      {latest && latest.baseline_validation.length > 0 && <ValidationCard review={latest} />}

      <ReviewsList reviews={reviews.data?.reviews} childId={childId} />

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t("development.baseline.confirmTitle")}
        description={t("development.baseline.confirmBody")}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t("development.baseline.cancel")}
            </Button>
            <Button loading={pending} onClick={newBaseline}>
              {t("development.baseline.confirm")}
            </Button>
          </div>
        }
      />
    </div>
  );
}

function SavedWarnings({ warnings, onClose }: { warnings: ReviewWarning[]; onClose: () => void }) {
  const { t } = useI18n();
  const evidence = useEvidence();
  return (
    <Alert
      tone="warning"
      title={t("development.review.warningsTitle")}
      action={
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("development.review.warningsClose")}
        </Button>
      }
    >
      <p>{t("development.review.warningsBody")}</p>
      <ul className="mt-2 list-inside list-disc space-y-0.5">
        {warnings.map((w) => (
          <li key={w.path}>
            <span dir="auto">{w.title ?? w.label}</span>
            {" — "}
            {evidence(w.observation_count ?? 0)}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function ItemsBlock({ title, list, items, tone, icon }: { title: string; list: string; items?: ProfileItem[] | null; tone: "strength" | "interest" | "helps"; icon?: string }) {
  const shown = items ?? [];
  return (
    <Section title={title} empty={!shown.length}>
      <ProfileItemChips list={list} items={shown} tone={tone} fallbackIcon={icon} size="sm" />
    </Section>
  );
}

function BaselineCard({
  baseline,
  earlier,
  summaryText,
}: {
  baseline: CurrentUnderstandingResponse["baseline"];
  earlier: BaselinesResponse["earlier"];
  summaryText?: string | null;
}) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  if (!baseline)
    return (
      <Card>
        <CardHeader title={t("development.baseline.title")} icon={<Flag className="size-4" aria-hidden />} />
        <CardBody>
          <EmptyState title={t("development.baseline.none")} description={t("development.baseline.noneHint")} />
        </CardBody>
      </Card>
    );
  const s: BaselineSummary = baseline.summary;
  const date = formatDate(baseline.created_at);
  return (
    <Card data-testid="baseline-card">
      <CardHeader
        title={t("development.baseline.title")}
        icon={<Flag className="size-4" aria-hidden />}
        description={baseline.created_by?.name ? t("development.baseline.createdBy", { date, name: baseline.created_by.name }) : t("development.baseline.created", { date })}
      />
      <CardBody className="space-y-5">
        {summaryText && (
          <Section title={t("development.sections.summary")}>
            <p className="text-base leading-relaxed text-ink" dir="auto">
              {summaryText}
            </p>
          </Section>
        )}
        <ItemsBlock title={t("development.sections.strengths")} list="strengths" items={s.strengths} tone="strength" icon="⭐" />
        <ItemsBlock title={t("development.sections.interests")} list="interests" items={s.interests} tone="interest" />
        <ItemsBlock title={t("development.sections.whatHelps")} list="what_helps" items={s.what_helps} tone="helps" icon="✓" />
        <BaselineSupport summary={s} />
        {earlier.length > 0 && (
          <Section title={t("development.baseline.history")} icon={<History className="size-4" aria-hidden />}>
            <p className="text-caption text-ink-muted">{t("development.baseline.historyHint")}</p>
            <ul className="space-y-1 text-sm text-ink">
              {earlier.map((b) => (
                <li key={b.id}>
                  {b.created_by?.name
                    ? t("development.baseline.createdBy", { date: formatDate(b.created_at), name: b.created_by.name })
                    : t("development.baseline.created", { date: formatDate(b.created_at) })}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </CardBody>
    </Card>
  );
}

function BaselineSupport({ summary }: { summary: BaselineSummary }) {
  const { t, locale } = useI18n();
  const { optionLabel, item } = useOptions();
  const independence = summary.support_needs?.independence ?? [];
  const sensitivities = summary.support_needs?.sensitivities ?? [];
  const focus = summary.focus_areas ?? [];
  const short = (level: string) => {
    const it = item("support_levels", level);
    return (it?.short ? pick(it.short, locale) : "") || optionLabel("support_levels", level);
  };
  const empty = !independence.length && !sensitivities.length && !focus.length;
  return (
    <Section title={t("development.sections.areasForSupport")} empty={empty}>
      <ul className="flex flex-wrap gap-2">
        {focus.map((f) => (
          <li key={`f-${f.id}`}>
            <Chip tone="focus" icon={<CurrentFocusIcon size={16} aria-hidden />}>
              {f.title}
            </Chip>
          </li>
        ))}
        {independence.map((n) => (
          <li key={`i-${n.area}-${n.reported_by}`}>
            <Chip tone="neutral">
              {optionLabel("independence_areas", n.area)} · {short(n.level)}
            </Chip>
          </li>
        ))}
        {sensitivities.map((s, i) => (
          <li key={`s-${s.key ?? s.custom ?? i}`}>
            <Chip tone="neutral" icon={s.key ? item("sensitivities", s.key)?.icon : undefined}>
              {s.key ? optionLabel("sensitivities", s.key) : s.custom}
            </Chip>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function UnderstandingCard({ understanding }: { understanding: CurrentUnderstanding | null }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  if (!understanding)
    return (
      <Card>
        <CardHeader title={t("development.current.title")} icon={<Sparkles className="size-4" aria-hidden />} />
        <CardBody>
          <EmptyState title={t("development.current.none")} description={t("development.current.noneHint")} />
        </CardBody>
      </Card>
    );
  const u = understanding;
  const fromReview = u.source === "review";
  const when = u.review_date ?? u.approved_at;
  const label = fromReview
    ? u.approved_by_name && when
      ? t("development.current.fromReviewBy", { name: u.approved_by_name, date: formatDate(when) })
      : t("development.current.fromReview", { date: when ? formatDate(when) : "" })
    : t("development.current.fromBaseline");
  return (
    <Card data-testid="understanding-card">
      <CardHeader
        title={t("development.current.title")}
        icon={<Sparkles className="size-4" aria-hidden />}
        description={label}
        action={fromReview ? <Badge tone="brand">{t("development.current.approved")}</Badge> : <Badge tone="neutral">{t("development.current.notReviewed")}</Badge>}
      />
      <CardBody className="space-y-5">
        <Section title={t("development.sections.summary")} empty={!u.summary}>
          <p className="text-base leading-relaxed text-ink" dir="auto">
            {u.summary}
          </p>
        </Section>
        <ItemsBlock title={t("development.sections.strengths")} list="strengths" items={u.strengths} tone="strength" icon="⭐" />
        <ItemsBlock title={t("development.sections.interests")} list="interests" items={u.interests} tone="interest" />
        <ItemsBlock title={t("development.sections.whatHelps")} list="what_helps" items={u.what_helps} tone="helps" icon="✓" />
        <Section title={t("development.sections.areasForSupport")} empty={!u.areas_for_support?.length}>
          <ul className="flex flex-wrap gap-2">
            {(u.areas_for_support ?? []).map((a, i) => (
              <li key={i}>
                <Chip tone="attention">{a}</Chip>
              </li>
            ))}
          </ul>
        </Section>
        {u.adaptations && (
          <Section title={t("development.current.adaptations")} icon={<Lightbulb className="size-4" aria-hidden />}>
            <p className="text-sm text-ink" dir="auto">
              {u.adaptations}
            </p>
          </Section>
        )}
        {u.next_steps && (
          <Section title={t("development.current.nextSteps")} icon={<ListChecks className="size-4" aria-hidden />}>
            <p className="text-sm text-ink" dir="auto">
              {u.next_steps}
            </p>
          </Section>
        )}
      </CardBody>
    </Card>
  );
}

function ValidationCard({ review }: { review: Review }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  return (
    <Card data-testid="validation-card">
      <CardHeader
        title={t("development.validation.title")}
        icon={<ClipboardCheck className="size-4" aria-hidden />}
        description={t("development.validation.fromReview", { date: formatDate(review.review_date) })}
      />
      <CardBody>
        <p className="mb-3 text-sm text-ink-muted">{t("development.validation.hint")}</p>
        <ul className="divide-y divide-line">
          {review.baseline_validation.map((v, i) => (
            <li key={`${v.list}-${v.key ?? v.custom ?? i}`} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  <span className="text-ink-muted">{t(`development.validation.lists.${v.list}`)} · </span>
                  <span dir="auto">{v.label}</span>
                </p>
                {v.note && (
                  <p className="mt-0.5 text-sm text-ink-muted" dir="auto">
                    {v.note}
                  </p>
                )}
                <EvidenceText count={v.observation_ids.length} className="mt-0.5 text-caption text-ink-muted" />
              </div>
              <ValidationBadge status={v.status} />
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function ReviewsList({ reviews, childId }: { reviews: Review[] | undefined; childId: string }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="past-reviews" className="space-y-3">
      <h2 id="past-reviews" className="flex items-center gap-2 text-lg font-semibold text-ink">
        <History className="size-5 text-ink-muted" aria-hidden />
        {t("development.reviews.title")}
      </h2>
      {!reviews ? (
        <Skeleton className="h-24" />
      ) : reviews.length === 0 ? (
        <EmptyState
          title={t("development.reviews.none")}
          description={t("development.reviews.noneHint")}
          action={
            <ButtonLink to={paths.newReview(childId)} variant="outline" icon={<Plus className="size-4" aria-hidden />}>
              {t("development.actions.review")}
            </ButtonLink>
          }
        />
      ) : (
        <ol className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id}>
              <ReviewItemCard review={r} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ReviewItemCard({ review }: { review: Review }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const [open, setOpen] = useState(false);
  const hasDetails = review.focus_review.length > 0 || review.baseline_validation.length > 0;
  return (
    <Card data-testid="review-item" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {formatDate(review.review_date)}
          {review.created_by?.name && <span className="font-normal text-ink-muted"> · {t("development.reviews.by", { name: review.created_by.name })}</span>}
        </p>
        {review.ai_suggested && <Badge tone="neutral">{t("development.reviews.aiSuggested")}</Badge>}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink" dir="auto">
        {review.summary}
      </p>
      {hasDetails && (
        <div className="mt-2">
          <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? t("development.reviews.hideDetails") : t("development.reviews.showDetails")}
          </Button>
          {open && (
            <div className="mt-3 space-y-4">
              {review.focus_review.length > 0 && (
                <Section title={t("development.reviews.focusTitle")} icon={<CurrentFocusIcon className="size-5" aria-hidden />}>
                  <ul className="space-y-2">
                    {review.focus_review.map((f) => (
                      <li key={f.focus_area_id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-ink" dir="auto">
                          {f.title}
                        </span>
                        {f.status && <ReviewStatusBadge status={f.status} />}
                        <Badge tone="outline">{t(`development.decision.${f.decision}`)}</Badge>
                        {f.what_worked && (
                          <span className="basis-full text-ink-muted" dir="auto">
                            {t("development.review.focus.whatWorked")}: {f.what_worked}
                          </span>
                        )}
                        {f.what_to_change && (
                          <span className="basis-full text-ink-muted" dir="auto">
                            {t("development.review.focus.whatToChange")}: {f.what_to_change}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {review.baseline_validation.length > 0 && (
                <Section title={t("development.reviews.validationTitle")} icon={<ClipboardCheck className="size-4" aria-hidden />}>
                  <ul className="flex flex-wrap gap-2">
                    {review.baseline_validation.map((v, i) => (
                      <li key={`${v.list}-${v.key ?? v.custom ?? i}`} className="flex items-center gap-1.5 text-sm">
                        <span dir="auto">{v.label}</span>
                        <ValidationBadge status={v.status} />
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

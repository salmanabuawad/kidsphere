import { FitPager } from "@/components/ui/FitPager";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ArrowRight, MessageSquareQuote, Zap } from "lucide-react";
import { ProvenanceBadge } from "@/components/source";
import { Alert, Badge, Button, ButtonLink, Chip, EmptyState, Skeleton, type Tone } from "@/components/ui";
import { pick } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { ChildLayout } from "@/features/children";
import { filterQuery, HistoryFilterBar, useUrlFilters, type FilterField } from "@/features/timeline";
import { isEdited, observationsUrl, PAGE_SIZE, type ObservationPage, type ObservationRow } from "./api";

/** The Observations tab filters (X-34): date range, focus, domain, situation, kind and result (stage E of a
 *  quick observation, how an activity went for feedback), kept in the URL. */
export const OBSERVATION_FIELDS: readonly FilterField[] = ["dates", "focus", "domain", "context", "source", "change", "result"];

const RESULT_TONE: Record<string, Tone> = { worked_well: "strength", partly: "attention", did_not_work: "neutral" };

/** True when the structured Observe → Understand → Act details hold anything. */
export function hasDetails(o: ObservationRow): boolean {
  return !!o.details && Object.values(o.details).some((v) => (typeof v === "string" ? v.trim() !== "" : v !== null && v !== undefined));
}

/** /children/:id/observations — quick and structured observations with URL-kept filters (OB). No charts, counts or %. */
export function ObservationsPage() {
  const { id = "" } = useParams();
  return (
    <ChildLayout childId={id}>
      <ObservationHistory childId={id} />
    </ChildLayout>
  );
}

function ObservationHistory({ childId }: { childId: string }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { search } = useLocation();
  const filters = useUrlFilters(OBSERVATION_FIELDS);
  const query = filterQuery(filters.values);
  const [rows, setRows] = useState<ObservationRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const offsetRef = useRef(0);

  const load = useCallback(
    async (offset: number, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const qs = [query, `limit=${PAGE_SIZE}`, `offset=${offset}`].filter(Boolean).join("&");
        const page = await api<ObservationPage>(`${observationsUrl(childId)}?${qs}`, { signal });
        if (signal?.aborted) return;
        setRows((prev) => {
          const seen = new Set(prev.map((o) => o.id));
          return [...(offset === 0 ? [] : prev), ...page.observations.filter((o) => offset === 0 || !seen.has(o.id))];
        });
        offsetRef.current = offset + page.observations.length;
        setHasMore(page.has_more);
        setLoaded(true);
      } catch (e) {
        if (signal?.aborted) return;
        setError(e instanceof ApiError ? e : new ApiError("INTERNAL", String(e), 0));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [childId, query],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    offsetRef.current = 0;
    void load(0, ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  return (
    <section aria-labelledby="observations-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="observations-title" className="font-display text-title flex items-center gap-2 font-semibold text-ink">
            <MessageSquareQuote className="size-5 text-ink-muted" aria-hidden />
            {t("history.observations.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t("history.observations.intro")}</p>
        </div>
        <ButtonLink to={paths.childObserve(childId)} icon={<Zap aria-hidden />}>
          {t("history.observations.add")}
        </ButtonLink>
      </div>

      <HistoryFilterBar childId={childId} fields={OBSERVATION_FIELDS} values={filters.values} onChange={filters.set} onClear={filters.clear} />

      {!loaded && loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : loaded && rows.length === 0 ? (
        filters.active ? (
          <EmptyState
            icon={<MessageSquareQuote aria-hidden />}
            title={t("history.observations.emptyFiltered")}
            action={
              <Button variant="outline" onClick={filters.clear}>
                {t("history.filters.clear")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<MessageSquareQuote aria-hidden />}
            title={t("history.observations.empty")}
            description={t("history.observations.emptyHint")}
            action={
              <ButtonLink to={paths.childObserve(childId)} icon={<Zap aria-hidden />}>
                {t("history.observations.add")}
              </ButtonLink>
            }
          />
        )
      ) : (
        <FitPager as="ol" className="space-y-3" testId="observation-list" reserve={150}>
          {rows.map((o) => (
            <ObservationCard key={o.id} childId={childId} observation={o} back={search} />
          ))}
        </FitPager>
      )}

      {error && (
        <Alert
          tone="error"
          action={
            <Button size="sm" variant="outline" onClick={() => void load(offsetRef.current)}>
              {t("common.retry")}
            </Button>
          }
        >
          {toMessage(error)}
        </Alert>
      )}

      {loaded && hasMore && !error && (
        <div className="flex justify-center">
          <Button variant="outline" size="lg" loading={loading} onClick={() => void load(offsetRef.current)}>
            {t("history.observations.loadOlder")}
          </Button>
        </div>
      )}

      <Link to={paths.childDevelopmentTimeline(childId)} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand underline underline-offset-2">
        {t("history.observations.timeline")}
        <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
      </Link>
    </section>
  );
}

/** The heading line of an observation: its kind ("Quick observation" / "After “…”"). */
export function ObservationKind({ o }: { o: ObservationRow }) {
  const { t } = useI18n();
  if (o.source === "content_feedback") return <>{o.content_title ? t("history.observations.after", { title: o.content_title }) : t("history.sources.content_feedback")}</>;
  return <>{t("history.sources.quick")}</>;
}

/** Result, support level, situation, domains and focus of an observation, as chips. */
export function ObservationChips({ o }: { o: ObservationRow }) {
  const { t, locale } = useI18n();
  const { item, labelOf, optionLabel } = useOptions();
  const chips: ReactNode[] = [];
  if (o.result)
    chips.push(
      <Chip key="result" tone={RESULT_TONE[o.result] ?? "neutral"} icon={item("content_results", o.result)?.icon}>
        {optionLabel("content_results", o.result)}
      </Chip>,
    );
  if (o.support_level) {
    const s = item("support_levels", o.support_level);
    chips.push(
      <Chip key="support" tone="outline">
        {s ? pick(s.short ?? s.label, locale) || s.key : o.support_level}
      </Chip>,
    );
  }
  const ctx = o.context ? item("observation_contexts", o.context) : undefined;
  if (ctx) chips.push(<Chip key="ctx" icon={ctx.icon}>{labelOf(ctx)}</Chip>);
  for (const d of o.domains ?? [])
    chips.push(
      <Chip key={`d:${d}`} icon={item("ai_domains", d)?.icon}>
        {optionLabel("ai_domains", d)}
      </Chip>,
    );
  if (o.focus_area_title)
    chips.push(
      <Chip key="focus" tone="focus">
        {t("history.observations.focus", { title: o.focus_area_title })}
      </Chip>,
    );
  if (!chips.length) return null;
  return <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>;
}

function ObservationCard({ childId, observation: o, back }: { childId: string; observation: ObservationRow; back: string }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const edited = isEdited(o);
  return (
    <div data-testid="observation-row" data-source={o.source}>
      <article className="rounded-lg border border-line bg-surface p-4">
        <header className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="font-semibold text-ink" dir="auto">
            <ObservationKind o={o} />
          </span>
          <span className="text-caption text-ink-muted">
            {formatDate(o.observed_at, { dateStyle: "medium", timeStyle: "short" })}
            {o.created_by?.name ? (
              <>
                {" · "}
                <bdi>{o.created_by.name}</bdi>
              </>
            ) : null}
          </span>
        </header>
        {o.observation ? (
          <blockquote className="border-s-4 border-line-strong ps-3 text-base leading-relaxed text-ink" dir="auto">
            {o.observation}
          </blockquote>
        ) : (
          <p className="text-sm text-ink-muted">{t("history.observations.resultOnly")}</p>
        )}
        <ObservationChips o={o} />
        <footer className="mt-2 flex flex-wrap items-center gap-2">
          <ProvenanceBadge kind="teacher_observed" />
          {hasDetails(o) && <Badge tone="neutral">{t("history.observations.structured")}</Badge>}
          {edited && (
            <Badge tone="muted" className="border border-line">
              <span data-testid="edited-marker">{t("history.observations.edited")}</span>
            </Badge>
          )}
          <Link
            to={paths.childObservation(childId, o.id)}
            state={{ observation: o, back }}
            className="ms-auto inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand underline underline-offset-2"
          >
            {t("history.observations.details")}
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
          </Link>
        </footer>
      </article>
    </div>
  );
}

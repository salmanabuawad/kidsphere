import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { BookOpen, CheckCircle2, ClipboardCheck, Flag, LineChart, MessageSquareQuote, PauseCircle, Sparkles, Target, Zap } from "lucide-react";
import { Alert, Button, ButtonLink, Chip, EmptyState, Skeleton, type Tone } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError, withQuery } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { cn } from "@/lib/utils";
import { ChildLayout } from "@/features/children";

export type TimelineEntryType = "baseline" | "focus_opened" | "focus_closed" | "observation" | "content_feedback" | "content_approved" | "review";

/** One entry of GET /api/children/{id}/timeline (WP-08). */
export type TimelineEntry = {
  type: TimelineEntryType;
  at: string;
  id: string;
  title: string | null;
  text: string | null;
  support_level: string | null;
  result: string | null;
  status: string | null;
  context: string | null;
  area: string | null;
  content_id: string | null;
  content_title: string | null;
  content_type: string | null;
  focus_area_id: string | null;
  focus_area_title: string | null;
  by_name: string | null;
};

export type TimelineResponse = { entries: TimelineEntry[]; limit: number; offset: number; has_more: boolean };

export const PAGE_SIZE = 30;
export const timelineUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/timeline`;

const STYLE: Record<string, { icon: ReactNode; ring: string }> = {
  baseline: { icon: <Flag className="size-4" aria-hidden />, ring: "bg-brand-soft text-brand" },
  focus_opened: { icon: <Target className="size-4" aria-hidden />, ring: "bg-amber-100 text-amber-800" },
  focus_closed_completed: { icon: <CheckCircle2 className="size-4" aria-hidden />, ring: "bg-emerald-100 text-emerald-800" },
  focus_closed_paused: { icon: <PauseCircle className="size-4" aria-hidden />, ring: "bg-stone-100 text-stone-700" },
  observation: { icon: <MessageSquareQuote className="size-4" aria-hidden />, ring: "bg-sky-100 text-sky-800" },
  content_feedback: { icon: <ClipboardCheck className="size-4" aria-hidden />, ring: "bg-violet-100 text-violet-800" },
  content_approved: { icon: <Sparkles className="size-4" aria-hidden />, ring: "bg-emerald-100 text-emerald-800" },
  review: { icon: <LineChart className="size-4" aria-hidden />, ring: "bg-brand-soft text-brand" },
};

const RESULT_TONE: Record<string, Tone> = { worked_well: "strength", partly: "attention", did_not_work: "neutral" };
const RESULT_EMOJI: Record<string, string> = { worked_well: "🌟", partly: "🌤️", did_not_work: "🌧️" };

const styleKey = (e: TimelineEntry) => (e.type === "focus_closed" ? `focus_closed_${e.status === "paused" ? "paused" : "completed"}` : e.type);

function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** /children/:id/timeline — what happened, newest first, grouped by day (spec §22). No charts, no counts. */
export function TimelinePage() {
  const { id = "" } = useParams();
  return (
    <ChildLayout childId={id}>
      <Timeline childId={id} />
    </ChildLayout>
  );
}

export function Timeline({ childId }: { childId: string }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
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
        const page = await api<TimelineResponse>(withQuery(timelineUrl(childId), { limit: PAGE_SIZE, offset }), { signal });
        if (signal?.aborted) return;
        setEntries((prev) => {
          const seen = new Set(prev.map((e) => `${e.type}:${e.id}`));
          return [...(offset === 0 ? [] : prev), ...page.entries.filter((e) => offset === 0 || !seen.has(`${e.type}:${e.id}`))];
        });
        offsetRef.current = offset + page.entries.length;
        setHasMore(page.has_more);
        setLoaded(true);
      } catch (e) {
        if (signal?.aborted) return;
        setError(e instanceof ApiError ? e : new ApiError("INTERNAL", String(e), 0));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [childId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    offsetRef.current = 0;
    void load(0, ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const groups: { key: string; at: string; items: TimelineEntry[] }[] = [];
  for (const e of entries) {
    const key = localDayKey(e.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, at: e.at, items: [e] });
  }

  return (
    <section aria-labelledby="timeline-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="timeline-title" className="flex items-center gap-2 text-xl font-semibold text-ink">
            <BookOpen className="size-5 text-brand" aria-hidden />
            {t("timeline.title")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("timeline.intro")}</p>
        </div>
        <ButtonLink to={paths.childObserve(childId)} icon={<Zap className="size-4" aria-hidden />}>
          {t("timeline.addObservation")}
        </ButtonLink>
      </div>

      {!loaded && loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : loaded && entries.length === 0 ? (
        <EmptyState
          icon={<BookOpen aria-hidden />}
          title={t("timeline.empty")}
          description={t("timeline.emptyHint")}
          action={
            <ButtonLink to={paths.childObserve(childId)} icon={<Zap className="size-4" aria-hidden />}>
              {t("timeline.addObservation")}
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <DayGroup key={g.key} at={g.at} items={g.items} childId={childId} />
          ))}
        </div>
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
            {t("timeline.loadOlder")}
          </Button>
        </div>
      )}
    </section>
  );
}

function DayGroup({ at, items, childId }: { at: string; items: TimelineEntry[]; childId: string }) {
  const { formatDate } = useFormat();
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted">{formatDate(at, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>
      <ol className="ms-4 space-y-4 border-s-2 border-line ps-6">
        {items.map((e) => (
          <Entry key={`${e.type}:${e.id}`} entry={e} childId={childId} />
        ))}
      </ol>
    </div>
  );
}

function Entry({ entry: e, childId }: { entry: TimelineEntry; childId: string }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { item, labelOf, optionLabel } = useOptions();
  const key = styleKey(e);
  const style = STYLE[key] ?? STYLE.observation!;
  const context = e.context ? item("observation_contexts", e.context) : undefined;

  let title: ReactNode = t(`timeline.types.${key}`);
  let body: ReactNode = null;
  const chips: ReactNode[] = [];

  if (context) chips.push(<Chip key="ctx" icon={context.icon}>{labelOf(context)}</Chip>);
  if (e.support_level)
    chips.push(
      <Chip key="support" tone="interest">
        {t(`observations.supportLevels.${e.support_level}`)}
      </Chip>,
    );

  switch (e.type) {
    case "observation":
      body = e.text && <Quote>{e.text}</Quote>;
      break;
    case "content_feedback":
      title = e.content_title ? t("timeline.feedbackOn", { title: e.content_title }) : title;
      if (e.result)
        chips.unshift(
          <Chip key="result" tone={RESULT_TONE[e.result] ?? "neutral"} icon={item("content_results", e.result)?.icon ?? RESULT_EMOJI[e.result]}>
            {optionLabel("content_results", e.result)}
          </Chip>,
        );
      body = e.text && <Quote>{e.text}</Quote>;
      break;
    case "content_approved":
      body = (
        <p className="text-sm">
          <Link to={paths.content(e.id)} className="inline-flex min-h-11 items-center font-medium text-brand hover:underline" dir="auto">
            {e.content_title ?? e.title}
          </Link>
          {e.content_type && <span className="text-muted"> · {optionLabel("content_types", e.content_type)}</span>}
        </p>
      );
      break;
    case "focus_opened":
    case "focus_closed":
      body = (
        <div className="space-y-1">
          <p className="font-medium text-ink" dir="auto">
            {e.title}
          </p>
          {e.text && <Quote>{e.text}</Quote>}
        </div>
      );
      if (e.area) chips.push(<Chip key="area" tone="attention">{optionLabel("priority_categories", e.area)}</Chip>);
      break;
    case "baseline":
      body = <p className="text-sm text-ink/80">{t("timeline.baselineText")}</p>;
      break;
    case "review":
      body = (
        <div className="space-y-1">
          {e.text && <Quote>{e.text}</Quote>}
          <Link to={paths.childDevelopment(childId)} className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline">
            {t("timeline.openReview")}
          </Link>
        </div>
      );
      break;
  }
  if (e.focus_area_title && (e.type === "observation" || e.type === "content_feedback" || e.type === "content_approved"))
    chips.push(
      <Chip key="focus" tone="attention">
        {t("timeline.focusLink", { title: e.focus_area_title })}
      </Chip>,
    );

  return (
    <li className="relative" data-testid="timeline-entry" data-type={e.type}>
      <span className={cn("absolute -start-[2.6rem] top-0 flex size-8 items-center justify-center rounded-full ring-4 ring-surface", style.ring)} aria-hidden>
        {style.icon}
      </span>
      <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <p className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="font-semibold text-ink" dir="auto">
            {title}
          </span>
          <span className="text-xs text-muted">
            {formatDate(e.at, { timeStyle: "short" })}
            {e.by_name ? ` · ${e.by_name}` : ""}
          </span>
        </p>
        {body}
        {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>}
      </div>
    </li>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="border-s-4 border-sky-200 ps-3 text-base leading-relaxed text-ink" dir="auto">
      {children}
    </blockquote>
  );
}

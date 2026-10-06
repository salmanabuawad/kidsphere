import { FitPager } from "@/components/ui/FitPager";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router";
import {
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Flag,
  Home,
  Lightbulb,
  MessageSquareQuote,
  PauseCircle,
  PencilLine,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { ProvenanceBadges, type ProvenanceKind } from "@/components/source";
import { Alert, BackLink, Button, ButtonLink, Chip, EmptyState, Skeleton, ToggleChip, type Tone } from "@/components/ui";
import { pick } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { cn } from "@/lib/utils";
import { ChildLayout } from "@/features/children";
import { filterQuery, HistoryFilterBar, useUrlFilters, type FilterField } from "./HistoryFilters";

export type TimelineEntryType =
  | "baseline"
  | "questionnaire_submitted"
  | "focus_opened"
  | "plan_changed"
  | "focus_closed"
  | "observation"
  | "content_feedback"
  | "content_approved"
  | "review"
  | "summary_approved"
  | "assessment_closed";

/** One entry of GET /api/children/{id}/timeline (backend/app/services/timeline.py). */
export type TimelineEntry = {
  type: TimelineEntryType;
  at: string;
  id: string;
  title: string | null;
  text: string | null;
  support_level: string | null;
  result: string | null;
  /** Focus / content status; entry mode (questionnaire); summary source; cycle kind. */
  status: string | null;
  context: string | null;
  area: string | null;
  content_id: string | null;
  content_title: string | null;
  content_type: string | null;
  focus_area_id: string | null;
  focus_area_title: string | null;
  /** plan_changed: the changed fields (title, description, category, plan, follow_up_on; status = reopened). */
  changes?: string[] | null;
  /** How a goal changed: manual, review, status, backfill… */
  via?: string | null;
  by_name: string | null;
};

export type TimelineResponse = { entries: TimelineEntry[]; limit: number; offset: number; has_more: boolean };

export const PAGE_SIZE = 30;
export const timelineUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/timeline`;

/** The filters of Development › Timeline (X-34): date range, focus, domain, activity type and result, plus entry kinds. */
export const TIMELINE_FIELDS: readonly FilterField[] = ["dates", "focus", "domain", "content_type", "result"];

/** Entry kinds the "Show" chips toggle, in the story order of R6 (baseline → plans → activities → observations → reviews → approved updates). */
export const TYPE_GROUPS: { key: string; types: TimelineEntryType[] }[] = [
  { key: "start", types: ["baseline", "questionnaire_submitted"] },
  { key: "plans", types: ["focus_opened", "plan_changed", "focus_closed"] },
  { key: "activities", types: ["content_approved", "content_feedback"] },
  { key: "observations", types: ["observation"] },
  { key: "reviews", types: ["review"] },
  { key: "approved", types: ["summary_approved", "assessment_closed"] },
];

const STYLE: Record<string, { icon: ReactNode; ring: string }> = {
  baseline: { icon: <Flag aria-hidden />, ring: "bg-brand-soft text-brand" },
  questionnaire_submitted: { icon: <Home aria-hidden />, ring: "bg-accent-soft text-ink" },
  focus_opened: { icon: <Target aria-hidden />, ring: "bg-focus-soft text-ink" },
  plan_changed: { icon: <PencilLine aria-hidden />, ring: "bg-focus-soft text-ink" },
  focus_closed_completed: { icon: <CheckCircle2 aria-hidden />, ring: "bg-focus-soft text-ink" },
  focus_closed_paused: { icon: <PauseCircle aria-hidden />, ring: "bg-tray text-ink-muted" },
  observation: { icon: <MessageSquareQuote aria-hidden />, ring: "bg-tray text-ink" },
  content_feedback: { icon: <ClipboardCheck aria-hidden />, ring: "bg-accent-soft text-ink" },
  content_approved: { icon: <Sparkles aria-hidden />, ring: "bg-accent-soft text-ink" },
  review: { icon: <Lightbulb aria-hidden />, ring: "bg-brand-soft text-brand" },
  summary_approved: { icon: <BadgeCheck aria-hidden />, ring: "bg-brand-soft text-brand" },
  assessment_closed: { icon: <Eye aria-hidden />, ring: "bg-tray text-ink" },
};

/** Whose information an entry is (X-22): shown as a visible badge. */
const PROVENANCE: Partial<Record<TimelineEntryType, ProvenanceKind>> = {
  questionnaire_submitted: "parent_said",
  observation: "teacher_observed",
  content_feedback: "teacher_observed",
  review: "teacher_approved",
  summary_approved: "teacher_approved",
};

const RESULT_TONE: Record<string, Tone> = { worked_well: "strength", partly: "attention", did_not_work: "neutral" };
const RESULT_EMOJI: Record<string, string> = { worked_well: "🌟", partly: "🌤️", did_not_work: "🌧️" };

const ALL_TYPES: ReadonlySet<string> = new Set(TYPE_GROUPS.flatMap((g) => g.types));

const reopened = (e: TimelineEntry) => e.type === "plan_changed" && e.status === "active" && !!e.changes?.includes("status");

const styleKey = (e: TimelineEntry) => {
  if (e.type === "focus_closed") return `focus_closed_${e.status === "paused" ? "paused" : "completed"}`;
  if (reopened(e)) return "focus_reopened";
  return e.type;
};

function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** /children/:id/timeline (the old tab) → Development › Timeline, keeping any filters. */
export function TimelineRedirect() {
  const { id = "" } = useParams();
  const { search } = useLocation();
  return <Navigate to={`${paths.childDevelopmentTimeline(id)}${search}`} replace />;
}

/** /children/:id/development/timeline — what happened, newest first, grouped by day (spec §22). No charts, no counts. */
export function TimelinePage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  return (
    <ChildLayout childId={id}>
      <BackLink to={paths.childDevelopment(id)} label={t("timeline.backToDevelopment")} className="mb-2" />
      <Timeline childId={id} />
    </ChildLayout>
  );
}

export function Timeline({ childId }: { childId: string }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const filters = useUrlFilters(TIMELINE_FIELDS, { types: true });
  // Only entry types the API knows (a hand-edited URL never breaks the page).
  const known = filters.types.filter((x) => ALL_TYPES.has(x));
  const query = filterQuery(filters.values, known);
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
        const qs = [query, `limit=${PAGE_SIZE}`, `offset=${offset}`].filter(Boolean).join("&");
        const page = await api<TimelineResponse>(`${timelineUrl(childId)}?${qs}`, { signal });
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
    [childId, query],
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

  const selectedTypes = new Set(filters.types);
  const toggleGroup = (types: TimelineEntryType[]) => {
    const on = types.every((x) => selectedTypes.has(x));
    const next = on ? filters.types.filter((x) => !types.includes(x as TimelineEntryType)) : [...filters.types, ...types.filter((x) => !selectedTypes.has(x))];
    filters.setTypes(next);
  };

  return (
    <section aria-labelledby="timeline-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="timeline-title" className="font-display text-title flex items-center gap-2 font-semibold text-ink">
            <BookOpen className="size-5 text-ink-muted" aria-hidden />
            {t("timeline.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t("timeline.intro")}</p>
        </div>
        <ButtonLink to={paths.childObserve(childId)} icon={<Zap aria-hidden />}>
          {t("timeline.addObservation")}
        </ButtonLink>
      </div>

      <div className="space-y-3">
        <div role="group" aria-label={t("timeline.show")} className="flex flex-wrap gap-2" data-testid="timeline-types">
          {TYPE_GROUPS.map((g) => (
            <ToggleChip key={g.key} selected={g.types.every((x) => selectedTypes.has(x))} onToggle={() => toggleGroup(g.types)}>
              {t(`timeline.groups.${g.key}`)}
            </ToggleChip>
          ))}
        </div>
        <HistoryFilterBar
          childId={childId}
          fields={TIMELINE_FIELDS}
          values={filters.values}
          onChange={filters.set}
          onClear={filters.clear}
          extraActive={filters.types.length > 0}
        />
      </div>

      {!loaded && loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : loaded && entries.length === 0 ? (
        filters.active ? (
          <EmptyState
            icon={<BookOpen aria-hidden />}
            title={t("timeline.emptyFiltered")}
            action={
              <Button variant="outline" onClick={filters.clear}>
                {t("history.filters.clear")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<BookOpen aria-hidden />}
            title={t("timeline.empty")}
            description={t("timeline.emptyHint")}
            action={
              <ButtonLink to={paths.childObserve(childId)} icon={<Zap aria-hidden />}>
                {t("timeline.addObservation")}
              </ButtonLink>
            }
          />
        )
      ) : (
        <FitPager className="space-y-8" reserve={150}>
          {groups.map((g) => (
            <DayGroup key={g.key} at={g.at} items={g.items} childId={childId} />
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
      <h3 className="mb-3 text-sm font-semibold text-ink-muted">{formatDate(at, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>
      <ol className="ms-4 space-y-4 border-s-2 border-line ps-6">
        {items.map((e) => (
          <Entry key={`${e.type}:${e.id}`} entry={e} childId={childId} />
        ))}
      </ol>
    </div>
  );
}

const linkClass = "inline-flex min-h-11 items-center text-sm font-medium text-brand underline underline-offset-2";

function Entry({ entry: e, childId }: { entry: TimelineEntry; childId: string }) {
  const { t, locale } = useI18n();
  const { formatDate } = useFormat();
  const { item, labelOf, optionLabel } = useOptions();
  const key = styleKey(e);
  const style = STYLE[key] ?? STYLE[e.type] ?? STYLE.observation!;
  const context = e.context ? item("observation_contexts", e.context) : undefined;
  const support = e.support_level ? item("support_levels", e.support_level) : undefined;

  let title: ReactNode = t(`timeline.types.${key}`);
  let body: ReactNode = null;
  const chips: ReactNode[] = [];

  if (context) chips.push(<Chip key="ctx" icon={context.icon}>{labelOf(context)}</Chip>);
  if (e.support_level)
    chips.push(
      <Chip key="support" tone="outline">
        {support ? pick(support.short ?? support.label, locale) || support.key : e.support_level}
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
          <Link to={paths.content(e.id)} className={linkClass} dir="auto">
            {e.content_title ?? e.title}
          </Link>
          {e.content_type && <span className="text-ink-muted"> · {optionLabel("content_types", e.content_type)}</span>}
        </p>
      );
      break;
    case "focus_opened":
    case "focus_closed":
    case "plan_changed": {
      const changed = (e.changes ?? []).filter((c) => c !== "status");
      body = (
        <div className="space-y-1">
          <p className="font-medium text-ink" dir="auto">
            {e.title ?? e.focus_area_title}
          </p>
          {e.type === "plan_changed" && changed.length > 0 && (
            <p className="text-sm text-ink-muted">{t("timeline.changed", { fields: changed.map((c) => t(`timeline.changes.${c}`)).join(", ") })}</p>
          )}
          {e.via === "review" && e.type !== "focus_opened" && <p className="text-sm text-ink-muted">{t("timeline.viaReview")}</p>}
          {e.text && <Quote>{e.text}</Quote>}
          {e.type !== "focus_opened" && (
            <Link to={paths.childPlan(childId)} className={linkClass}>
              {t("timeline.openPlan")}
            </Link>
          )}
        </div>
      );
      if (e.area) chips.push(<Chip key="area" tone="focus">{optionLabel("priority_categories", e.area)}</Chip>);
      break;
    }
    case "baseline":
      body = <p className="text-sm text-ink">{t("timeline.baselineText")}</p>;
      break;
    case "questionnaire_submitted":
      body = (
        <div className="space-y-1">
          {e.status && <p className="text-sm text-ink">{t(`timeline.entryMode.${e.status}`)}</p>}
          <Link to={paths.childParentView(childId)} className={linkClass}>
            {t("timeline.openParentView")}
          </Link>
        </div>
      );
      break;
    case "review":
      body = (
        <div className="space-y-1">
          {e.text && <Quote>{e.text}</Quote>}
          <Link to={paths.childDevelopment(childId)} className={linkClass}>
            {t("timeline.openReview")}
          </Link>
        </div>
      );
      break;
    case "summary_approved":
      body = (
        <div className="space-y-1">
          {e.status && <p className="text-sm text-ink-muted">{t(`timeline.summarySource.${e.status}`)}</p>}
          {e.text && <Quote>{e.text}</Quote>}
          <Link to={paths.childDevelopment(childId)} className={linkClass}>
            {t("timeline.openReview")}
          </Link>
        </div>
      );
      break;
    case "assessment_closed":
      body = (
        <div className="space-y-1">
          {e.status && <p className="text-sm text-ink">{t(`timeline.cycle.${e.status}`)}</p>}
          <Link to={paths.childTeacherObservation(childId, { cycle: e.id })} className={linkClass}>
            {t("timeline.openCycle")}
          </Link>
        </div>
      );
      break;
  }
  if (e.focus_area_title && (e.type === "observation" || e.type === "content_feedback" || e.type === "content_approved"))
    chips.push(
      <Chip key="focus" tone="focus">
        {t("timeline.focusLink", { title: e.focus_area_title })}
      </Chip>,
    );
  const provenance = PROVENANCE[e.type];

  return (
    <li className="relative" data-testid="timeline-entry" data-type={e.type}>
      <span
        className={cn("absolute -start-[2.6rem] top-0 flex size-8 items-center justify-center rounded-full ring-4 ring-surface [&_svg]:size-4", style.ring)}
        aria-hidden
      >
        {style.icon}
      </span>
      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="font-semibold text-ink" dir="auto">
            {title}
          </span>
          <span className="text-caption text-ink-muted">
            {formatDate(e.at, { timeStyle: "short" })}
            {e.by_name ? (
              <>
                {" · "}
                <bdi>{e.by_name}</bdi>
              </>
            ) : null}
          </span>
        </p>
        {body}
        {(chips.length > 0 || provenance) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {chips}
            {provenance && <ProvenanceBadges kinds={[provenance]} />}
          </div>
        )}
      </div>
    </li>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="border-s-4 border-line-strong ps-3 text-base leading-relaxed text-ink" dir="auto">
      {children}
    </blockquote>
  );
}

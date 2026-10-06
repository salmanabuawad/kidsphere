import { useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { CalendarClock, CheckCircle2, FileDown, History, Pause, Pencil, Plus, RotateCcw, Sparkles, Zap } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, Card, Chip, EmptyState, NumeralBlock, PageSkeleton, Skeleton, ToggleChip, toast } from "@/components/ui";
import { CurrentFocusIcon } from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { isApiError } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { ChildLayout, childUrl, isStaffView, type ChildDetail } from "@/features/children";
import {
  closeFocus,
  createFocus,
  focusListUrl,
  localDate,
  MAX_ACTIVE,
  MIN_SUGGESTED,
  PLAN_COLUMNS,
  promoteNeed,
  todayIso,
  updateFocus,
  WHY_STEPS,
  type FocusArea,
  type FocusCreateInput,
  type FocusList,
  type NeedCandidate,
  type Period,
  type StrengthOption,
} from "./api";
import { AddGoalDialog, GoalEditorDialog } from "./GoalDialogs";
import { GoalHistoryDialog } from "./GoalHistory";
import { FamilyHopesPanel, NeedsPanel } from "./PlanPanels";

/**
 * /children/:id/plan — the Plan tab (COVERAGE-MATRIX §5.7, Domain 15): one card per goal with the
 * 6 plan columns (goal, what we will do, how often, who, how we will know it helps, follow-up date)
 * and strength → need → adaptation; the "2–3 goals for this period" guidance (max 3 active); the
 * family's hopes (suggestions only) and the Domain 13 candidates; closed goals with their history;
 * and "Export plan" (the Reports tab, preset to the intervention plan report).
 */
export function PlanPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const childState = useFetch<{ child: ChildDetail }>(childUrl(id));
  const child = childState.data?.child;

  if (!child) {
    if (childState.error)
      return (
        <Alert
          tone="error"
          action={
            childState.error.status === 404 ? (
              <ButtonLink size="sm" variant="outline" to={paths.children()}>
                {t("children.child.backToList")}
              </ButtonLink>
            ) : (
              <Button size="sm" variant="outline" onClick={childState.reload}>
                {t("common.retry")}
              </Button>
            )
          }
        >
          {toMessage(childState.error)}
        </Alert>
      );
    return <PageSkeleton />;
  }

  const strengths = isStaffView(child)
    ? [
        ...child.strengths.map((i) => ({ list: i.list ?? "strengths", key: i.key ?? null, custom: i.custom ?? null })),
        ...child.interests.map((i) => ({ list: i.list ?? "interests", key: i.key ?? null, custom: i.custom ?? null })),
      ]
    : [];

  return (
    <ChildLayout childId={id} child={child} onChanged={childState.reload}>
      <PlanManager childId={id} strengths={strengths} />
    </ChildLayout>
  );
}

function periodLabel(p: Period, periods: Period[], t: (k: string, v?: Record<string, string | number>) => string, fmt: (d: Date) => string) {
  const kind = p === periods[0] ? t("focus.period.initial") : t("focus.period.reassessment");
  const from = p.period_from ?? p.filled_on;
  if (p.period_from && p.period_to) return `${kind} · ${t("focus.period.range", { from: fmt(localDate(p.period_from)), to: fmt(localDate(p.period_to)) })}`;
  return from ? `${kind} · ${t("focus.period.from", { date: fmt(localDate(from)) })}` : kind;
}

function PlanManager({ childId, strengths }: { childId: string; strengths: StrengthOption[] }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload, setData } = useFetch<FocusList>(focusListUrl(childId));
  const { pending, run } = useAction();
  const [adding, setAdding] = useState<{ category?: string } | null>(null);
  const [editing, setEditing] = useState<FocusArea | null>(null);
  const [historyOf, setHistoryOf] = useState<FocusArea | null>(null);
  const [period, setPeriod] = useState<string>("all");

  const all = useMemo(() => data?.focus_areas ?? [], [data]);
  const max = data?.max_active ?? MAX_ACTIVE;
  const periods = data?.periods ?? [];
  const inPeriod = (f: FocusArea) => period === "all" || (period === "none" ? !f.assessment_id : f.assessment_id === period);
  const activeAll = all.filter((f) => f.status === "active");
  const active = activeAll.filter(inPeriod);
  const closed = all.filter((f) => f.status !== "active" && inPeriod(f));
  const full = activeAll.length >= max;
  const fmt = (d: Date) => formatDate(d);

  const replace = (next: FocusArea) =>
    setData((prev) => ({ ...(prev ?? { max_active: MAX_ACTIVE }), focus_areas: (prev?.focus_areas ?? []).map((f) => (f.id === next.id ? { ...f, ...next } : f)) }));

  const onLimit = (e: unknown) => {
    if (isApiError(e, "FOCUS_LIMIT")) {
      toast(t("focus.limit"), "error");
      reload();
    } else toast(toMessage(e), "error");
  };

  /** Run a goal change; a 409 FOCUS_LIMIT gets the friendly "3 at a time" message. */
  async function change(fn: () => Promise<{ focus_area: FocusArea }>, success: string) {
    const r = await run(fn, { success, errorToast: false, onError: onLimit });
    if (r.ok) replace(r.data.focus_area);
    return r.ok;
  }

  async function add(body: FocusCreateInput) {
    const r = await run(() => createFocus(childId, body), { success: t("focus.toasts.created"), errorToast: false, onError: onLimit });
    if (r.ok) {
      setAdding(null);
      reload();
    }
  }

  async function promote(c: NeedCandidate) {
    const r = await run(() => promoteNeed(c.assessment_id, c.index), { success: t("focus.needs.promotedToast"), errorToast: false, onError: onLimit });
    if (r.ok) reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-title flex items-center gap-3 font-semibold text-ink">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-tray">
              <CurrentFocusIcon className="size-5" />
            </span>
            {t("focus.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t("focus.intro")}</p>
          <p className="text-caption mt-1 text-ink-muted" data-testid="plan-sequence">
            {t("focus.sequence")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <Badge tone={full ? "attention" : "neutral"}>
              <span data-testid="focus-count">{t("focus.activeCount", { count: activeAll.length, max })}</span>
            </Badge>
          )}
          <Button icon={<Plus className="size-4" aria-hidden />} disabled={!data || full || pending} onClick={() => setAdding({})}>
            {t("focus.add")}
          </Button>
          <ButtonLink variant="outline" to={paths.childReports(childId, { type: "intervention_plan" })} icon={<FileDown className="size-4" aria-hidden />}>
            {t("focus.exportPlan")}
          </ButtonLink>
        </div>
      </div>

      {data && activeAll.length < MIN_SUGGESTED && (
        <Alert tone="tip" title={t("focus.guidance.title")}>
          <span data-testid="plan-guidance">{t("focus.guidance.body")}</span>
        </Alert>
      )}
      {full && <Alert tone="info">{t("focus.full")}</Alert>}

      {periods.length > 0 && (
        <div role="radiogroup" aria-label={t("focus.period.label")} className="flex flex-wrap gap-2" data-testid="period-filter">
          {[{ id: "all", label: t("focus.period.all") }, ...periods.map((p) => ({ id: p.id, label: periodLabel(p, periods, t, fmt) })), ...(all.some((f) => !f.assessment_id) ? [{ id: "none", label: t("focus.period.none") }] : [])].map((o) => (
            <ToggleChip key={o.id} single selected={period === o.id} onToggle={() => setPeriod(o.id)}>
              {o.label}
            </ToggleChip>
          ))}
        </div>
      )}

      {error && !data ? (
        <Alert
          tone="error"
          action={
            <Button size="sm" variant="outline" onClick={reload}>
              {t("common.retry")}
            </Button>
          }
        >
          {toMessage(error)}
        </Alert>
      ) : loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          <section aria-labelledby="plan-active" className="space-y-3">
            <h3 id="plan-active" className="text-sm font-semibold text-ink-muted">
              {t("focus.active")}
            </h3>
            {active.length === 0 ? (
              <EmptyState
                icon={<CurrentFocusIcon aria-hidden />}
                title={t("focus.noneActive")}
                description={t("focus.noneActiveHint")}
                action={
                  <Button icon={<Plus className="size-4" aria-hidden />} disabled={full} onClick={() => setAdding({})}>
                    {t("focus.add")}
                  </Button>
                }
              />
            ) : (
              <ol className="space-y-4" data-testid="focus-active-list">
                {active.map((f, i) => (
                  <GoalCard
                    key={f.id}
                    n={i + 1}
                    focus={f}
                    childId={childId}
                    busy={pending}
                    onEdit={() => setEditing(f)}
                    onHistory={() => setHistoryOf(f)}
                    onPause={() => change(() => closeFocus(f.id, "paused"), t("focus.toasts.paused"))}
                    onComplete={() => change(() => closeFocus(f.id, "completed"), t("focus.toasts.completed"))}
                  />
                ))}
              </ol>
            )}
          </section>

          {(data?.family_hopes || (data?.need_candidates ?? []).length > 0) && (
            <div className="grid items-start gap-4 md:grid-cols-2">
              {data?.family_hopes && <FamilyHopesPanel hopes={data.family_hopes} full={full} onUse={(category) => setAdding({ category })} />}
              {(data?.need_candidates ?? []).length > 0 && (
                <NeedsPanel
                  childId={childId}
                  candidates={data?.need_candidates ?? []}
                  full={full}
                  busy={pending}
                  onPromote={promote}
                  thirdGoal={activeAll.length === MIN_SUGGESTED}
                />
              )}
            </div>
          )}

          {closed.length > 0 && (
            <section aria-labelledby="plan-closed" className="space-y-3" data-testid="closed-goals">
              <h3 id="plan-closed" className="text-sm font-semibold text-ink-muted">
                {t("focus.closedTitle")}
              </h3>
              <ul className="space-y-2">
                {closed.map((f) => (
                  <ClosedGoal key={f.id} focus={f} onHistory={() => setHistoryOf(f)}>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<RotateCcw className="size-4" aria-hidden />}
                      disabled={pending}
                      onClick={() => change(() => updateFocus(f.id, { status: "active" }), t("focus.toasts.reactivated"))}
                    >
                      {t("focus.actions.reactivate")}
                    </Button>
                    {f.status === "paused" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<CheckCircle2 className="size-4" aria-hidden />}
                        disabled={pending}
                        onClick={() => change(() => closeFocus(f.id, "completed"), t("focus.toasts.completed"))}
                      >
                        {t("focus.actions.complete")}
                      </Button>
                    )}
                  </ClosedGoal>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <AddGoalDialog
        open={!!adding}
        presetCategory={adding?.category}
        activeCount={activeAll.length}
        onClose={() => setAdding(null)}
        busy={pending}
        activeKeys={activeAll.map((f) => f.suggestion_key).filter((k): k is string => !!k)}
        onAdd={add}
      />
      <GoalEditorDialog
        focus={editing}
        strengths={strengths}
        onClose={() => setEditing(null)}
        onSaved={(f) => {
          replace(f);
          setEditing(null);
        }}
      />
      <GoalHistoryDialog focus={historyOf} onClose={() => setHistoryOf(null)} />
    </div>
  );
}

/** "Follow-up 12 Nov" (attention when the date has come). */
export function FollowUpChip({ date }: { date: string }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const due = date <= todayIso();
  const text = formatDate(localDate(date));
  return (
    <Chip tone={due ? "attention" : "neutral"} icon={<CalendarClock className="size-4" aria-hidden />}>
      <span data-testid="follow-up-chip" data-due={due ? "true" : "false"}>
        {due ? t("focus.followUp.due", { date: text }) : t("focus.followUp.on", { date: text })}
      </span>
    </Chip>
  );
}

function PlanValue({ value }: { value?: string | null }) {
  const { t } = useI18n();
  const v = typeof value === "string" ? value.trim() : "";
  return v ? (
    <span className="text-sm text-ink" dir="auto">
      {v}
    </span>
  ) : (
    <span className="text-sm text-ink-muted italic">{t("focus.empty")}</span>
  );
}

function GoalCard({
  n,
  focus,
  childId,
  busy,
  onEdit,
  onHistory,
  onPause,
  onComplete,
}: {
  n: number;
  focus: FocusArea;
  childId: string;
  busy: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onPause: () => void;
  onComplete: () => void;
}) {
  const { t } = useI18n();
  const { optionLabel, item } = useOptions();
  const { formatDate } = useFormat();
  const icon = item("priority_categories", focus.category)?.icon;
  const plan = focus.plan ?? {};
  const cell = (k: (typeof PLAN_COLUMNS)[number]): ReactNode => {
    if (k === "title") return <PlanValue value={focus.title} />;
    if (k === "follow_up_on") return focus.follow_up_on ? <FollowUpChip date={focus.follow_up_on} /> : <PlanValue value={null} />;
    return <PlanValue value={plan[k]} />;
  };
  return (
    <li data-testid="focus-card">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
          <NumeralBlock n={n} className="mt-1" />
          <div className="min-w-0 flex-1">
            <h4 className="text-lg font-semibold text-ink" dir="auto">
              {focus.title}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <Chip tone="focus" icon={icon}>
                {optionLabel("priority_categories", focus.category)}
              </Chip>
              {focus.created_at && <span>{t("focus.since", { date: formatDate(focus.created_at) })}</span>}
            </div>
            {focus.description && (
              <p className="mt-2 text-sm text-ink" dir="auto">
                {focus.description}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-line bg-tray/40 px-4 py-4 sm:px-5">
          <p className="mb-2 text-sm font-semibold text-ink">{t("focus.why.title")}</p>
          <ol className="flex flex-wrap items-stretch gap-2" aria-label={t("focus.why.title")}>
            {WHY_STEPS.map((k) => (
              <li key={k} data-testid={`plan-step-${k}`} className="min-w-40 flex-1 rounded-sm bg-surface px-3 py-2 ring-1 ring-line">
                <p className="text-caption font-semibold text-ink-muted">{t(`focus.why.${k}`)}</p>
                <PlanValue value={plan[k]} />
              </li>
            ))}
          </ol>
        </div>

        <div className="border-t border-line px-4 py-4 sm:px-5">
          <p className="mb-2 text-sm font-semibold text-ink">{t("focus.columns.label")}</p>
          <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("focus.columns.label")}>
            {PLAN_COLUMNS.map((k) => (
              <div key={k} data-testid={`plan-col-${k}`} className="min-w-0">
                <dt className="text-caption font-semibold text-ink-muted">{t(`focus.columns.${k}`)}</dt>
                <dd className="mt-0.5">{cell(k)}</dd>
              </div>
            ))}
          </dl>
          {plan.review_on && !focus.follow_up_on && (
            <p className="text-caption mt-2 text-ink-muted" dir="auto">
              {t("focus.editor.earlierReview", { text: plan.review_on })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line p-3 sm:px-5">
          <Button size="sm" variant="soft" icon={<Pencil className="size-4" aria-hidden />} disabled={busy} onClick={onEdit}>
            {t("focus.actions.edit")}
          </Button>
          <ButtonLink size="sm" variant="outline" to={paths.newContent(childId, { mode: "growth_support", focus: focus.id })} icon={<Sparkles className="size-4" aria-hidden />}>
            {t("focus.actions.createContent")}
          </ButtonLink>
          <ButtonLink size="sm" variant="outline" to={paths.childObserve(childId)} icon={<Zap className="size-4" aria-hidden />}>
            {t("focus.actions.observe")}
          </ButtonLink>
          <Button size="sm" variant="ghost" icon={<History className="size-4" aria-hidden />} onClick={onHistory}>
            {t("focus.actions.history")}
          </Button>
          <Button size="sm" variant="ghost" icon={<Pause className="size-4" aria-hidden />} disabled={busy} onClick={onPause}>
            {t("focus.actions.pause")}
          </Button>
          <Button size="sm" variant="ghost" icon={<CheckCircle2 className="size-4" aria-hidden />} disabled={busy} onClick={onComplete}>
            {t("focus.actions.complete")}
          </Button>
        </div>
      </Card>
    </li>
  );
}

function ClosedGoal({ focus, onHistory, children }: { focus: FocusArea; onHistory: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const { formatDate } = useFormat();
  return (
    <li data-testid="closed-goal" className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface p-3 sm:p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink" dir="auto">
          {focus.title}
        </p>
        <p className="text-sm text-ink-muted">
          <Badge tone="muted">{t(`focus.history.status.${focus.status}`)}</Badge> {optionLabel("priority_categories", focus.category)}
          {focus.closed_at ? ` · ${t("focus.closedOn", { date: formatDate(focus.closed_at) })}` : ""}
        </p>
        {focus.close_reason && (
          <p className="text-caption mt-0.5 text-ink-muted" dir="auto">
            {t("focus.history.reason", { text: focus.close_reason })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" icon={<History className="size-4" aria-hidden />} onClick={onHistory}>
          {t("focus.actions.history")}
        </Button>
        {children}
      </div>
    </li>
  );
}

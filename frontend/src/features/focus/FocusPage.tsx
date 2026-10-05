import { useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { ArrowDown, CheckCircle2, ChevronDown, Pause, Pencil, Plus, RotateCcw, Sparkles, Target, Zap } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, Chip, Dialog, EmptyState, Field, Input, PageSkeleton, Select, Skeleton, Textarea, ToggleChip, toast } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { isApiError } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { ChildLayout, childUrl, isStaffView, type ChildDetail } from "@/features/children";
import { PlanEditor } from "@/features/wizard/FocusPicker";
import type { MergedItem } from "@/features/wizard/api";
import { closeFocus, createFocus, focusListUrl, MAX_ACTIVE, PLAN_STEPS, updateFocus, type FocusArea, type FocusCreateInput, type FocusList } from "./api";

/** /children/:id/focus — active (up to 3), paused and completed focus areas, each with its 5-step plan. */
export function FocusPage() {
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

  const strengths: MergedItem[] = isStaffView(child)
    ? [
        ...child.strengths.map((i) => ({ key: i.key, custom: i.custom, list: i.list ?? "strengths", sources: i.sources ?? [] })),
        ...child.interests.map((i) => ({ key: i.key, custom: i.custom, list: i.list ?? "interests", sources: i.sources ?? [] })),
      ]
    : [];

  return (
    <ChildLayout childId={id} child={child} onChanged={childState.reload}>
      <FocusManager childId={id} strengths={strengths} />
    </ChildLayout>
  );
}

function FocusManager({ childId, strengths }: { childId: string; strengths: MergedItem[] }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload, setData } = useFetch<FocusList>(focusListUrl(childId));
  const { pending, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FocusArea | null>(null);

  const all = data?.focus_areas ?? [];
  const max = data?.max_active ?? MAX_ACTIVE;
  const active = all.filter((f) => f.status === "active");
  const paused = all.filter((f) => f.status === "paused");
  const completed = all.filter((f) => f.status === "completed");
  const full = active.length >= max;

  const replace = (next: FocusArea) =>
    setData((prev) => ({ max_active: prev?.max_active ?? MAX_ACTIVE, focus_areas: (prev?.focus_areas ?? []).map((f) => (f.id === next.id ? { ...f, ...next } : f)) }));

  /** Run a focus change; a 409 FOCUS_LIMIT gets the friendly "3 at a time" message. */
  async function change(fn: () => Promise<{ focus_area: FocusArea }>, success: string) {
    const r = await run(fn, {
      success,
      errorToast: false,
      onError: (e) => {
        if (isApiError(e, "FOCUS_LIMIT")) {
          toast(t("focus.limit"), "error");
          reload();
        } else toast(toMessage(e), "error");
      },
    });
    if (r.ok) replace(r.data.focus_area);
    return r.ok;
  }

  async function saveEdit(body: { title: string; description: string | null }) {
    if (!editing) return;
    if (await change(() => updateFocus(editing.id, body), t("focus.saved"))) setEditing(null);
  }

  async function add(body: FocusCreateInput) {
    const r = await run(() => createFocus(childId, body), {
      success: t("focus.created"),
      errorToast: false,
      onError: (e) => {
        if (isApiError(e, "FOCUS_LIMIT")) {
          toast(t("focus.limit"), "error");
          reload();
        } else toast(toMessage(e), "error");
      },
    });
    if (r.ok) {
      setData((prev) => ({ max_active: prev?.max_active ?? MAX_ACTIVE, focus_areas: [...(prev?.focus_areas ?? []), r.data.focus_area] }));
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <Target className="size-5 text-amber-600" aria-hidden />
            {t("focus.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t("focus.intro")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <Badge tone={full ? "attention" : "brand"}>
              <span data-testid="focus-count">{t("focus.activeCount", { count: active.length, max })}</span>
            </Badge>
          )}
          <Button icon={<Plus className="size-4" aria-hidden />} disabled={!data || full || pending} onClick={() => setAdding(true)}>
            {t("focus.add")}
          </Button>
        </div>
      </div>

      {full && <Alert tone="info">{t("focus.full")}</Alert>}

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
          <section aria-labelledby="focus-active" className="space-y-3">
            <h3 id="focus-active" className="text-sm font-semibold text-muted">
              {t("focus.active")}
            </h3>
            {active.length === 0 ? (
              <EmptyState
                icon={<Target aria-hidden />}
                title={t("focus.noneActive")}
                description={t("focus.noneActiveHint")}
                action={
                  <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
                    {t("focus.add")}
                  </Button>
                }
              />
            ) : (
              <ol className="space-y-4" data-testid="focus-active-list">
                {active.map((f, i) => (
                  <ActiveFocusCard
                    key={f.id}
                    n={i + 1}
                    focus={f}
                    childId={childId}
                    strengths={strengths}
                    busy={pending}
                    onEdit={() => setEditing(f)}
                    onPause={() => change(() => closeFocus(f.id, "paused"), t("focus.pausedToast"))}
                    onComplete={() => change(() => closeFocus(f.id, "completed"), t("focus.completedToast"))}
                    onPlanSaved={(next) => replace(next)}
                  />
                ))}
              </ol>
            )}
          </section>

          {paused.length > 0 && (
            <ClosedSection id="focus-paused" title={t("focus.paused")} items={paused}>
              {(f) => (
                <>
                  <Button size="sm" variant="outline" icon={<RotateCcw className="size-4" aria-hidden />} disabled={pending} onClick={() => change(() => updateFocus(f.id, { status: "active" }), t("focus.reactivated"))}>
                    {t("focus.reactivate")}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<CheckCircle2 className="size-4" aria-hidden />} disabled={pending} onClick={() => change(() => closeFocus(f.id, "completed"), t("focus.completedToast"))}>
                    {t("focus.complete")}
                  </Button>
                </>
              )}
            </ClosedSection>
          )}

          {completed.length > 0 && (
            <ClosedSection id="focus-completed" title={t("focus.completed")} items={completed}>
              {(f) => (
                <Button size="sm" variant="outline" icon={<RotateCcw className="size-4" aria-hidden />} disabled={pending} onClick={() => change(() => updateFocus(f.id, { status: "active" }), t("focus.reactivated"))}>
                  {t("focus.reactivate")}
                </Button>
              )}
            </ClosedSection>
          )}
        </>
      )}

      <AddFocusDialog open={adding} onClose={() => setAdding(false)} busy={pending} activeKeys={active.map((f) => f.suggestion_key).filter((k): k is string => !!k)} onAdd={add} />
      <EditFocusDialog focus={editing} onClose={() => setEditing(null)} onSave={saveEdit} busy={pending} />
    </div>
  );
}

function ActiveFocusCard({
  n,
  focus,
  childId,
  strengths,
  busy,
  onEdit,
  onPause,
  onComplete,
  onPlanSaved,
}: {
  n: number;
  focus: FocusArea;
  childId: string;
  strengths: MergedItem[];
  busy: boolean;
  onEdit: () => void;
  onPause: () => void;
  onComplete: () => void;
  onPlanSaved: (f: FocusArea) => void;
}) {
  const { t } = useI18n();
  const { optionLabel, item } = useOptions();
  const { formatDate } = useFormat();
  const [planOpen, setPlanOpen] = useState(false);
  const icon = item("priority_categories", focus.category)?.icon;
  return (
    <li className="rounded-2xl border border-amber-200 bg-white shadow-sm" data-testid="focus-card">
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-lg font-bold text-white" aria-hidden>
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-lg font-semibold text-ink" dir="auto">
            {focus.title}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Chip tone="attention" icon={icon}>
              {optionLabel("priority_categories", focus.category)}
            </Chip>
            {focus.created_at && <span>{t("focus.since", { date: formatDate(focus.created_at) })}</span>}
          </div>
          {focus.description && (
            <p className="mt-2 text-sm text-ink/80" dir="auto">
              {focus.description}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-amber-100 bg-amber-50/40 px-4 py-4 sm:px-5">
        <p className="mb-3 text-sm font-semibold text-amber-900">{t("focus.plan.title")}</p>
        <ol className="space-y-1" aria-label={t("focus.plan.title")}>
          {PLAN_STEPS.map((k, i) => {
            const value = typeof focus.plan?.[k] === "string" ? focus.plan[k]!.trim() : "";
            return (
              <li key={k} data-testid={`plan-step-${k}`}>
                {i > 0 && <ArrowDown className="mx-auto my-0.5 size-4 text-amber-400" aria-hidden />}
                <div className="flex gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-amber-100">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">{t(`focus.plan.${k}`)}</p>
                    {value ? (
                      <p className="text-sm text-ink" dir="auto">
                        {value}
                      </p>
                    ) : (
                      <p className="text-sm text-muted italic">{t("focus.plan.empty")}</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          aria-expanded={planOpen}
          onClick={() => setPlanOpen((o) => !o)}
          className="mt-3 flex min-h-11 items-center gap-2 text-sm font-medium text-brand hover:underline"
        >
          <Pencil className="size-4" aria-hidden />
          {t("focus.editPlan")}
          <ChevronDown className={cn("size-4 transition-transform", planOpen && "rotate-180")} aria-hidden />
        </button>
        {planOpen && (
          <PlanEditor
            focus={focus}
            strengths={strengths}
            onSaved={(f) => {
              onPlanSaved(f);
              setPlanOpen(false);
            }}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line p-3 sm:px-5">
        <ButtonLink size="sm" variant="soft" to={paths.newContent(childId, { mode: "growth_support", focus: focus.id })} icon={<Sparkles className="size-4" aria-hidden />}>
          {t("focus.createContent")}
        </ButtonLink>
        <ButtonLink size="sm" variant="outline" to={paths.childObserve(childId)} icon={<Zap className="size-4" aria-hidden />}>
          {t("focus.observe")}
        </ButtonLink>
        <Button size="sm" variant="ghost" icon={<Pencil className="size-4" aria-hidden />} disabled={busy} onClick={onEdit}>
          {t("focus.edit")}
        </Button>
        <Button size="sm" variant="ghost" icon={<Pause className="size-4" aria-hidden />} disabled={busy} onClick={onPause}>
          {t("focus.pause")}
        </Button>
        <Button size="sm" variant="ghost" icon={<CheckCircle2 className="size-4" aria-hidden />} disabled={busy} onClick={onComplete}>
          {t("focus.complete")}
        </Button>
      </div>
    </li>
  );
}

function ClosedSection({ id, title, items, children }: { id: string; title: string; items: FocusArea[]; children: (f: FocusArea) => ReactNode }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const { formatDate } = useFormat();
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="text-sm font-semibold text-muted">
        {title}
      </h3>
      <ul className="space-y-2">
        {items.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-3 sm:p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink" dir="auto">
                {f.title}
              </p>
              <p className="text-sm text-muted">
                {optionLabel("priority_categories", f.category)}
                {f.closed_at ? ` · ${t("focus.closedOn", { date: formatDate(f.closed_at) })}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">{children(f)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddFocusDialog({
  open,
  onClose,
  onAdd,
  activeKeys,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (body: FocusCreateInput) => void;
  activeKeys: string[];
  busy: boolean;
}) {
  const { t } = useI18n();
  const { list, labelOf } = useOptions();
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const suggestions = list("focus_suggestions");
  const categories = list("priority_categories");

  return (
    <Dialog open={open} onClose={onClose} title={t("focus.addTitle")} description={t("focus.intro")} size="lg">
      <div className="space-y-5">
        <div className="space-y-4">
          <p className="text-sm font-semibold text-ink">{t("focus.suggestions")}</p>
          {categories.map((cat) => {
            const items = suggestions.filter((s) => s.category === cat.key);
            if (!items.length) return null;
            return (
              <div key={cat.key} className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-muted">
                  {cat.icon && <span aria-hidden>{cat.icon}</span>}
                  {labelOf(cat)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {items.map((s) => (
                    <ToggleChip
                      key={s.key}
                      tone="attention"
                      selected={activeKeys.includes(s.key)}
                      disabled={busy || activeKeys.includes(s.key)}
                      onToggle={() => onAdd({ suggestion_key: s.key, title: labelOf(s) })}
                    >
                      {labelOf(s)}
                    </ToggleChip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <form
          className="space-y-3 rounded-2xl border border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!category || !title.trim()) return;
            onAdd({ category, title: title.trim(), ...(description.trim() ? { description: description.trim() } : {}) });
          }}
        >
          <p className="text-sm font-semibold text-ink">{t("focus.custom")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("focus.category")}>
              {(p) => (
                <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">{t("focus.choose")}</option>
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {`${c.icon ?? ""} ${labelOf(c)}`.trim()}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("focus.customTitle")}>
              {(p) => <Input {...p} dir="auto" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
          </div>
          <Field label={t("focus.description")}>
            {(p) => <Textarea {...p} dir="auto" rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
          <Button type="submit" icon={<Plus className="size-4" aria-hidden />} disabled={busy || !category || !title.trim()}>
            {t("focus.create")}
          </Button>
        </form>
      </div>
    </Dialog>
  );
}

function EditFocusDialog({
  focus,
  onClose,
  onSave,
  busy,
}: {
  focus: FocusArea | null;
  onClose: () => void;
  onSave: (body: { title: string; description: string | null }) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={!!focus} onClose={onClose} title={t("focus.editTitle")}>
      {focus && <EditFocusForm key={focus.id} focus={focus} onSave={onSave} onCancel={onClose} busy={busy} />}
    </Dialog>
  );
}

function EditFocusForm({
  focus,
  onSave,
  onCancel,
  busy,
}: {
  focus: FocusArea;
  onSave: (body: { title: string; description: string | null }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(focus.title);
  const [description, setDescription] = useState(focus.description ?? "");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({ title: title.trim(), description: description.trim() || null });
      }}
    >
      <Field label={t("focus.customTitle")}>
        {(p) => <Input {...p} dir="auto" maxLength={200} required value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <Field label={t("focus.description")}>
        {(p) => <Textarea {...p} dir="auto" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("focus.cancel")}
        </Button>
        <Button type="submit" loading={busy} disabled={!title.trim()}>
          {t("focus.save")}
        </Button>
      </div>
    </form>
  );
}

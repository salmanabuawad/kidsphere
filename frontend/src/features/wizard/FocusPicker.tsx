import { useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip, NumeralBlock, ToggleChip } from "@/components/ui/Chip";
import { CurrentFocusIcon } from "@/icons";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Spinner";
import { useI18n } from "@/i18n/I18nProvider";
import { isApiError } from "@/lib/api";
import { useOptions } from "@/lib/options";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { closeFocus, createFocus, focusListUrl, updateFocus, type FocusArea, type FocusPlan, type MergedItem } from "./api";

export const MAX_ACTIVE_FOCUS = 3;

/** The 5 labelled steps of the professional framework (PLAN-ADJUSTMENTS B1). */
export const PLAN_STEPS = ["strength_used", "need", "adaptation", "what_we_will_do", "success_looks_like"] as const;

/**
 * Step 7 (staff, teacher view): choose up to 3 Current Focus areas from
 * focus_suggestions (grouped by priority_categories) or a custom one, each
 * with an optional plan. Writes go straight to the focus API.
 */
export function FocusPicker({
  childId,
  parentPriorities,
  strengths,
}: {
  childId: string;
  /** priority_categories keys the parent chose: shown first and marked. */
  parentPriorities: string[];
  /** Merged strengths + interests, offered as quick picks for "strength used". */
  strengths: MergedItem[];
}) {
  const { t } = useI18n();
  const { list, labelOf, optionLabel, item } = useOptions();
  const { data, loading, reload, setData } = useFetch<{ focus_areas: FocusArea[] }>(focusListUrl(childId), { status: "active" });
  const { pending, run } = useAction();
  const [customCategory, setCustomCategory] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const active = data?.focus_areas ?? [];
  const full = active.length >= MAX_ACTIVE_FOCUS;
  const chosenKeys = new Set(active.map((f) => f.suggestion_key).filter(Boolean));

  const categories = [...list("priority_categories")].sort(
    (a, b) => Number(parentPriorities.includes(b.key)) - Number(parentPriorities.includes(a.key)),
  );
  const suggestions = list("focus_suggestions");

  async function add(body: Parameters<typeof createFocus>[1]) {
    const r = await run(() => createFocus(childId, body), {
      errorToast: true,
      onError: (e) => {
        if (isApiError(e, "FOCUS_LIMIT")) reload();
      },
    });
    if (r.ok) setData((prev) => ({ focus_areas: [...(prev?.focus_areas ?? []), r.data.focus_area] }));
    return r.ok;
  }

  async function remove(f: FocusArea) {
    const r = await run(() => closeFocus(f.id, "paused"));
    if (r.ok) setData((prev) => ({ focus_areas: (prev?.focus_areas ?? []).filter((x) => x.id !== f.id) }));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-title flex items-center gap-3 font-semibold text-ink">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-focus-soft" aria-hidden>
            <CurrentFocusIcon className="size-5" />
          </span>
          {t("wizard.focus.title")}
        </h3>
        <Badge tone={full ? "attention" : "brand"} className="tabular">{t("wizard.focus.count", { count: active.length, max: MAX_ACTIVE_FOCUS })}</Badge>
      </div>
      <p className="text-sm text-ink-muted">{t("wizard.focus.hint")}</p>

      {loading && !data ? (
        <Skeleton className="h-24" />
      ) : active.length === 0 ? (
        <p className="rounded-md border-[1.5px] border-dashed border-line-strong p-4 text-sm text-ink-muted">{t("wizard.focus.none")}</p>
      ) : (
        <ol className="space-y-3">
          {active.map((f, i) => (
            <FocusCard
              key={f.id}
              index={i + 1}
              focus={f}
              categoryLabel={optionLabel("priority_categories", f.category)}
              strengths={strengths}
              onRemove={() => remove(f)}
              onSaved={(next) => setData((prev) => ({ focus_areas: (prev?.focus_areas ?? []).map((x) => (x.id === next.id ? next : x)) }))}
              busy={pending}
            />
          ))}
        </ol>
      )}

      {full && <Alert tone="info">{t("wizard.focus.full")}</Alert>}

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-ink-muted">{t("wizard.focus.suggestions")}</h4>
        {categories.map((cat) => {
          const items = suggestions.filter((s) => s.category === cat.key);
          if (!items.length) return null;
          return (
            <div key={cat.key} className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                {cat.icon && (
                  <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-surface text-base leading-none">
                    {cat.icon}
                  </span>
                )}
                <span dir="auto">{labelOf(cat)}</span>
                {parentPriorities.includes(cat.key) && <Badge tone="brand">{t("wizard.focus.parentPriority")}</Badge>}
              </p>
              <div className="flex flex-wrap gap-2">
                {items.map((s) => (
                  <ToggleChip
                    key={s.key}
                    tone="focus"
                    selected={chosenKeys.has(s.key)}
                    disabled={pending || (full && !chosenKeys.has(s.key)) || chosenKeys.has(s.key)}
                    onToggle={() => void add({ suggestion_key: s.key, title: labelOf(s) })}
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
        className="space-y-3 rounded-lg border border-line p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!customCategory || !customTitle.trim()) return;
          if (await add({ category: customCategory, title: customTitle.trim() })) {
            setCustomTitle("");
            setCustomCategory("");
          }
        }}
      >
        <p className="text-sm font-semibold text-ink">{t("wizard.focus.custom")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("wizard.focus.category")}>
            {(p) => (
              <Select {...p} value={customCategory} disabled={full} onChange={(e) => setCustomCategory(e.target.value)}>
                <option value="">{t("wizard.choose")}</option>
                {list("priority_categories").map((c) => (
                  <option key={c.key} value={c.key}>
                    {(item("priority_categories", c.key)?.icon ?? "") + " " + labelOf(c)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("wizard.focus.customTitle")}>
            {(p) => <Input {...p} dir="auto" maxLength={200} value={customTitle} disabled={full} onChange={(e) => setCustomTitle(e.target.value)} />}
          </Field>
        </div>
        <Button type="submit" variant="secondary" icon={<Plus aria-hidden />} disabled={full || pending || !customCategory || !customTitle.trim()}>
          {t("wizard.focus.addCustom")}
        </Button>
      </form>
    </div>
  );
}

function FocusCard({
  index,
  focus,
  categoryLabel,
  strengths,
  onRemove,
  onSaved,
  busy,
}: {
  index: number;
  focus: FocusArea;
  categoryLabel: string;
  strengths: MergedItem[];
  onRemove: () => void;
  onSaved: (f: FocusArea) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const hasPlan = !!focus.plan && Object.values(focus.plan).some(Boolean);
  return (
    <li className="rounded-lg bg-focus-soft">
      <div className="flex items-start gap-3 p-4">
        <NumeralBlock n={index} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink" dir="auto">
            {focus.title}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip tone="outline">{categoryLabel}</Chip>
            {hasPlan && <Chip tone="brand">{t("wizard.focus.hasPlan")}</Chip>}
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<X className="size-4" aria-hidden />} disabled={busy} onClick={onRemove}>
          {t("wizard.focus.notNow")}
        </Button>
      </div>
      <div className="border-t border-line px-4 py-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-sm font-semibold text-focus-ink"
        >
          {hasPlan ? t("wizard.plan.edit") : t("wizard.plan.add")}
          <ChevronDown className={open ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} aria-hidden />
        </button>
        {open && <PlanEditor focus={focus} strengths={strengths} onSaved={(f) => { onSaved(f); setOpen(false); }} />}
      </div>
    </li>
  );
}

/** Strength → Need → Adaptation → What we will do → Success looks like. */
export function PlanEditor({ focus, strengths, onSaved }: { focus: FocusArea; strengths: MergedItem[]; onSaved: (f: FocusArea) => void }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const { pending, run } = useAction();
  const [plan, setPlan] = useState<FocusPlan>(focus.plan ?? {});
  const set = (k: keyof FocusPlan, v: string) => setPlan((p) => ({ ...p, [k]: v }));
  const strengthLabels = strengths
    .map((s) => (s.key ? optionLabel(s.list ?? "strengths", s.key) : s.custom ?? ""))
    .filter(Boolean)
    .slice(0, 8);

  return (
    <div className="space-y-4 pb-3 pt-1">
      <ol className="space-y-4">
        {PLAN_STEPS.map((k, i) => (
          <li key={k} className="space-y-1.5">
            <Field label={`${i + 1}. ${t(`wizard.plan.${k}`)}`} hint={t(`wizard.plan.${k}Hint`)}>
              {(p) => <Textarea {...p} rows={2} maxLength={1000} value={plan[k] ?? ""} onChange={(e) => set(k, e.target.value)} />}
            </Field>
            {k === "strength_used" && strengthLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {strengthLabels.map((label) => (
                  <ToggleChip
                    key={label}
                    tone="strength"
                    selected={(plan.strength_used ?? "").includes(label)}
                    onToggle={() => set("strength_used", plan.strength_used ? `${plan.strength_used}, ${label}` : label)}
                  >
                    {label}
                  </ToggleChip>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <Button
        loading={pending}
        onClick={async () => {
          const r = await run(() => updateFocus(focus.id, { plan }), { success: t("wizard.plan.saved") });
          if (r.ok) onSaved(r.data.focus_area);
        }}
      >
        {t("wizard.plan.save")}
      </Button>
    </div>
  );
}

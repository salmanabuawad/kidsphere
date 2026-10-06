import { useState } from "react";
import { Plus } from "lucide-react";
import { Alert, Button, Dialog, Field, Input, Select, Textarea, ToggleChip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { useAction } from "@/lib/useAction";
import { MAX_ACTIVE, MIN_SUGGESTED, updateFocus, type FocusArea, type FocusCreateInput, type FocusPlan, type StrengthOption } from "./api";

/** Add a goal: a suggestion (one tap) or the teacher's own words. Adding the 3rd goal of a period shows the 2–3 guidance. */
export function AddGoalDialog({
  open,
  presetCategory,
  activeCount,
  onClose,
  onAdd,
  activeKeys,
  busy,
}: {
  open: boolean;
  presetCategory?: string;
  activeCount: number;
  onClose: () => void;
  onAdd: (body: FocusCreateInput) => void;
  activeKeys: string[];
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={t("focus.addDialog.title")} description={t("focus.intro")} size="lg">
      {open && <AddGoalForm key={presetCategory ?? "-"} presetCategory={presetCategory} activeCount={activeCount} onAdd={onAdd} activeKeys={activeKeys} busy={busy} />}
    </Dialog>
  );
}

function AddGoalForm({
  presetCategory,
  activeCount,
  onAdd,
  activeKeys,
  busy,
}: {
  presetCategory?: string;
  activeCount: number;
  onAdd: (body: FocusCreateInput) => void;
  activeKeys: string[];
  busy: boolean;
}) {
  const { t } = useI18n();
  const { list, labelOf } = useOptions();
  const [category, setCategory] = useState(presetCategory ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const suggestions = list("focus_suggestions");
  const categories = list("priority_categories");
  const shown = presetCategory ? categories.filter((c) => c.key === presetCategory) : categories;

  return (
    <div className="space-y-5">
      {activeCount === MIN_SUGGESTED && activeCount < MAX_ACTIVE && (
        <Alert tone="tip" title={t("focus.guidance.title")}>
          <span data-testid="third-goal-guidance">{t("focus.guidance.third")}</span>
        </Alert>
      )}
      <div className="space-y-4">
        <p className="text-sm font-semibold text-ink">{t("focus.addDialog.suggestions")}</p>
        {shown.map((cat) => {
          const items = suggestions.filter((s) => s.category === cat.key);
          if (!items.length) return null;
          return (
            <div key={cat.key} className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
                {cat.icon && <span aria-hidden>{cat.icon}</span>}
                {labelOf(cat)}
              </p>
              <div className="flex flex-wrap gap-2">
                {items.map((s) => (
                  <ToggleChip
                    key={s.key}
                    tone="focus"
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
        className="space-y-3 rounded-md border border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!category || !title.trim()) return;
          onAdd({ category, title: title.trim(), ...(description.trim() ? { description: description.trim() } : {}) });
        }}
      >
        <p className="text-sm font-semibold text-ink">{t("focus.addDialog.custom")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("focus.addDialog.category")}>
            {(p) => (
              <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{t("focus.addDialog.choose")}</option>
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {`${c.icon ?? ""} ${labelOf(c)}`.trim()}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("focus.addDialog.goal")}>
            {(p) => <Input {...p} dir="auto" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
        </div>
        <Field label={t("focus.addDialog.description")}>
          {(p) => <Textarea {...p} dir="auto" rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Button type="submit" icon={<Plus className="size-4" aria-hidden />} disabled={busy || !category || !title.trim()}>
          {t("focus.addDialog.create")}
        </Button>
      </form>
    </div>
  );
}

export type GoalDraft = {
  title: string;
  description: string;
  what_we_will_do: string;
  frequency: string;
  who: string;
  success_looks_like: string;
  follow_up_on: string;
  strength_used: string;
  need: string;
  adaptation: string;
};

const PLAN_TEXT = ["what_we_will_do", "frequency", "who", "success_looks_like", "strength_used", "need", "adaptation"] as const;

export function toDraft(f: FocusArea): GoalDraft {
  const p = f.plan ?? {};
  return {
    title: f.title,
    description: f.description ?? "",
    what_we_will_do: p.what_we_will_do ?? "",
    frequency: p.frequency ?? "",
    who: p.who ?? "",
    success_looks_like: p.success_looks_like ?? "",
    follow_up_on: f.follow_up_on ?? "",
    strength_used: p.strength_used ?? "",
    need: p.need ?? "",
    adaptation: p.adaptation ?? "",
  };
}

/** The PUT body: all 6 plan columns + strength / need / adaptation; the legacy review_on text is kept as it was. */
export function editPayload(f: FocusArea, d: GoalDraft) {
  const plan: FocusPlan = { ...(f.plan?.review_on ? { review_on: f.plan.review_on } : {}) };
  for (const k of PLAN_TEXT) if (d[k].trim()) plan[k] = d[k].trim();
  return {
    title: d.title.trim() || f.title,
    description: d.description.trim() || null,
    plan: Object.keys(plan).length ? plan : null,
    follow_up_on: d.follow_up_on || null,
  };
}

export function GoalEditorDialog({
  focus,
  strengths,
  onClose,
  onSaved,
}: {
  focus: FocusArea | null;
  strengths: StrengthOption[];
  onClose: () => void;
  onSaved: (f: FocusArea) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={!!focus} onClose={onClose} title={t("focus.editor.title")} size="lg">
      {focus && <GoalEditor key={focus.id} focus={focus} strengths={strengths} onCancel={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function GoalEditor({ focus, strengths, onCancel, onSaved }: { focus: FocusArea; strengths: StrengthOption[]; onCancel: () => void; onSaved: (f: FocusArea) => void }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const { pending, run } = useAction();
  const [d, setD] = useState<GoalDraft>(() => toDraft(focus));
  const set = (k: keyof GoalDraft, v: string) => setD((prev) => ({ ...prev, [k]: v }));
  const strengthLabels = [...new Set(strengths.map((s) => (s.key ? optionLabel(s.list, s.key) : (s.custom ?? ""))).filter(Boolean))].slice(0, 8);

  const area = (k: "what_we_will_do" | "success_looks_like" | "strength_used" | "need" | "adaptation", rows = 2) => (
    <Field label={k === "strength_used" || k === "need" || k === "adaptation" ? t(`focus.why.${k}`) : t(`focus.columns.${k}`)} hint={t(`focus.editor.${k}Hint`)}>
      {(p) => <Textarea {...p} dir="auto" rows={rows} maxLength={1000} value={d[k]} onChange={(e) => set(k, e.target.value)} />}
    </Field>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.title.trim()) return;
        const r = await run(() => updateFocus(focus.id, editPayload(focus, d)), { success: t("focus.toasts.saved") });
        if (r.ok) onSaved(r.data.focus_area);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("focus.editor.goal")}>
          {(p) => <Input {...p} dir="auto" maxLength={200} required value={d.title} onChange={(e) => set("title", e.target.value)} />}
        </Field>
        <Field label={t("focus.editor.description")}>
          {(p) => <Input {...p} dir="auto" maxLength={2000} value={d.description} onChange={(e) => set("description", e.target.value)} />}
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold text-ink">{t("focus.editor.planTitle")}</legend>
        {area("what_we_will_do")}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("focus.columns.frequency")} hint={t("focus.editor.frequencyHint")}>
            {(p) => <Input {...p} dir="auto" maxLength={200} value={d.frequency} onChange={(e) => set("frequency", e.target.value)} />}
          </Field>
          <Field label={t("focus.columns.who")} hint={t("focus.editor.whoHint")}>
            {(p) => <Input {...p} dir="auto" maxLength={200} value={d.who} onChange={(e) => set("who", e.target.value)} />}
          </Field>
        </div>
        {area("success_looks_like")}
        <Field label={t("focus.columns.follow_up_on")} hint={t("focus.editor.follow_up_onHint")}>
          {(p) => <Input {...p} type="date" dir="ltr" value={d.follow_up_on} onChange={(e) => set("follow_up_on", e.target.value)} />}
        </Field>
        {focus.plan?.review_on && (
          <p className="text-caption text-ink-muted" dir="auto">
            {t("focus.editor.earlierReview", { text: focus.plan.review_on })}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold text-ink">{t("focus.editor.whyTitle")}</legend>
        {area("strength_used")}
        {strengthLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {strengthLabels.map((label) => (
              <ToggleChip
                key={label}
                tone="strength"
                selected={d.strength_used.includes(label)}
                onToggle={() => set("strength_used", d.strength_used.trim() ? `${d.strength_used.trim()}, ${label}` : label)}
              >
                {label}
              </ToggleChip>
            ))}
          </div>
        )}
        {area("need")}
        {area("adaptation")}
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("focus.editor.cancel")}
        </Button>
        <Button type="submit" loading={pending} disabled={!d.title.trim()}>
          {t("focus.editor.save")}
        </Button>
      </div>
    </form>
  );
}

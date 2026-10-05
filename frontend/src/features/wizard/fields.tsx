import { useId, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ToggleChip } from "@/components/ui/Chip";
import { Input, Textarea } from "@/components/ui/Field";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { cn } from "@/lib/utils";
import { itemId, type Item, type SensitivityItem } from "./api";

/** A question: label, optional hint, then the control. */
export function Question({ label, hint, children, id }: { label: ReactNode; hint?: ReactNode; children: ReactNode; id?: string }) {
  const autoId = useId();
  const labelId = id ?? autoId;
  return (
    <fieldset className="space-y-3" aria-labelledby={labelId}>
      <div>
        <legend id={labelId} className="text-base font-semibold text-ink" dir="auto">
          {label}
        </legend>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </fieldset>
  );
}

const CUSTOM_MAX = 120;

/** Option chips (multi) plus "add your own" entries. */
export function ItemsField({
  list,
  value,
  onChange,
  custom = true,
  tone = "brand",
  max,
}: {
  list: string;
  value: Item[];
  onChange: (v: Item[]) => void;
  custom?: boolean;
  tone?: Tone;
  max?: number;
}) {
  const { t } = useI18n();
  const { list: options, labelOf } = useOptions();
  const [draft, setDraft] = useState("");
  const selected = new Set(value.map(itemId));
  const full = max !== undefined && value.length >= max;
  const customs = value.filter((v) => v.custom);

  const toggle = (it: Item) => {
    const id = itemId(it);
    if (selected.has(id)) onChange(value.filter((v) => itemId(v) !== id));
    else if (!full) onChange([...value, it]);
  };
  const add = () => {
    const text = draft.trim().slice(0, CUSTOM_MAX);
    if (!text) return;
    const it: Item = { custom: text };
    if (!selected.has(itemId(it)) && !full) onChange([...value, it]);
    setDraft("");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options(list).map((o) => (
          <ToggleChip
            key={o.key}
            tone={tone}
            icon={o.icon}
            selected={selected.has(`k:${o.key}`)}
            disabled={full && !selected.has(`k:${o.key}`)}
            onToggle={() => toggle({ key: o.key })}
          >
            {labelOf(o)}
          </ToggleChip>
        ))}
        {customs.map((c) => (
          <ToggleChip key={itemId(c)} tone={tone} selected onToggle={() => toggle(c)}>
            {c.custom}
          </ToggleChip>
        ))}
      </div>
      {custom && (
        <div className="flex gap-2">
          <Input
            dir="auto"
            value={draft}
            maxLength={CUSTOM_MAX}
            placeholder={t("wizard.addOwnPlaceholder")}
            aria-label={t("wizard.addOwn")}
            disabled={full}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button variant="outline" icon={<Plus className="size-4" aria-hidden />} disabled={!draft.trim() || full} onClick={add}>
            {t("wizard.add")}
          </Button>
        </div>
      )}
      {max !== undefined && <p className="text-xs text-muted">{t("wizard.chosenOfMax", { count: value.length, max })}</p>}
    </div>
  );
}

/** Option chips (multi), keys only. */
export function KeysField({ list, value, onChange, tone = "brand", highlight }: { list: string; value: string[]; onChange: (v: string[]) => void; tone?: Tone; highlight?: ReactNode }) {
  const { list: options, labelOf } = useOptions();
  const selected = new Set(value);
  return (
    <div className="flex flex-wrap gap-2">
      {options(list).map((o) => (
        <ToggleChip
          key={o.key}
          tone={tone}
          icon={o.icon}
          selected={selected.has(o.key)}
          onToggle={() => onChange(selected.has(o.key) ? value.filter((k) => k !== o.key) : [...value, o.key])}
        >
          {labelOf(o)}
        </ToggleChip>
      ))}
      {highlight}
    </div>
  );
}

/** One choice (tap again to clear). */
export function SingleField({ list, value, onChange }: { list: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const { list: options, labelOf } = useOptions();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options(list).map((o) => (
        <ToggleChip key={o.key} icon={o.icon} selected={value === o.key} onToggle={() => onChange(value === o.key ? undefined : o.key)}>
          {labelOf(o)}
        </ToggleChip>
      ))}
    </div>
  );
}

export function TextField({ value, onChange, label, rows = 2 }: { value: string; onChange: (v: string) => void; label: string; rows?: number }) {
  return <Textarea rows={rows} value={value} maxLength={2000} aria-label={label} onChange={(e) => onChange(e.target.value)} />;
}

/** Step 5: one row per daily-routine area, the one support scale per row. */
export function LevelsGrid({ list, value, onChange }: { list: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const { list: options, labelOf } = useOptions();
  const levels = options("support_levels");
  return (
    <div className="divide-y divide-line rounded-2xl border border-line">
      {options(list).map((area) => (
        <div key={area.key} className="space-y-2 p-3 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
          <p className="flex min-w-36 items-center gap-2 font-medium text-ink sm:w-44 sm:shrink-0">
            {area.icon && (
              <span aria-hidden className="text-lg">
                {area.icon}
              </span>
            )}
            <span dir="auto">{labelOf(area)}</span>
          </p>
          <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label={labelOf(area)}>
            {levels.map((lvl) => {
              const on = value[area.key] === lvl.key;
              return (
                <button
                  key={lvl.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    const next = { ...value };
                    if (on) delete next[area.key];
                    else next[area.key] = lvl.key;
                    onChange(next);
                  }}
                  className={cn(
                    "min-h-11 rounded-xl border px-2 py-1.5 text-sm leading-tight transition-colors",
                    on ? levelTone[lvl.key] ?? "border-brand bg-brand text-brand-ink" : "border-line bg-white text-ink hover:bg-stone-50",
                  )}
                >
                  <span dir="auto">{labelOf(lvl)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const levelTone: Record<string, string> = {
  independent: "border-emerald-600 bg-emerald-600 text-white",
  some_support: "border-sky-600 bg-sky-600 text-white",
  significant_support: "border-violet-600 bg-violet-600 text-white",
  not_observed: "border-stone-500 bg-stone-500 text-white",
};

/** Step 6: things in the environment that may affect the child; per item "what happens / what helps". */
export function SensitivitiesField({ value, onChange }: { value: SensitivityItem[]; onChange: (v: SensitivityItem[]) => void }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const base = value.map(({ key, custom }) => (key ? { key } : { custom: custom! })) as Item[];
  const byId = new Map(value.map((v) => [itemId(v), v]));

  const setBase = (items: Item[]) => onChange(items.map((it) => byId.get(itemId(it)) ?? { ...it, what_helps: [] }));
  const update = (id: string, patch: Partial<SensitivityItem>) =>
    onChange(value.map((v): SensitivityItem => (itemId(v) === id ? ({ ...v, ...patch } as SensitivityItem) : v)));

  return (
    <div className="space-y-4">
      <ItemsField list="sensitivities" value={base} onChange={setBase} tone="attention" />
      {value.map((v) => {
        const id = itemId(v);
        const label = v.key ? optionLabel("sensitivities", v.key) : v.custom;
        return (
          <div key={id} className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
            <p className="font-semibold text-ink" dir="auto">
              {label}
            </p>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("wizard.sensitivity.whatHappens")}</span>
              <Input dir="auto" maxLength={500} value={v.what_happens ?? ""} onChange={(e) => update(id, { what_happens: e.target.value })} />
            </label>
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("wizard.sensitivity.whatHelps")}</span>
              <ItemsField list="sensitivity_helps" value={v.what_helps ?? []} tone="helps" onChange={(helps) => update(id, { what_helps: helps })} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

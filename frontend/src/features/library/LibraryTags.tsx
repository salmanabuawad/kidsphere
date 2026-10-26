/**
 * What a library item builds (goals: focus_suggestions keys) and which children it suits (keys of
 * the SUITS_LISTS profile lists), each with optional own wording. Labels come from GET /api/options.
 */
import { useState } from "react";
import { Plus, Target, Users, X } from "lucide-react";
import { Button, Chip, Input, ToggleChip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { SUITS_LISTS, type Goal, type Suit } from "./api";

const MAX_TAGS = 8;
const MAX_CUSTOM = 80;

export function goalLabel(g: Goal, optionLabel: (list: string, key: string) => string) {
  return "custom" in g ? g.custom : optionLabel("focus_suggestions", g.key);
}

export function suitLabel(s: Suit, optionLabel: (list: string, key: string) => string) {
  return "custom" in s ? s.custom : optionLabel(s.list, s.key);
}

/** Read-only chips for teachers: "Builds" and "Suits children who…". */
export function ItemTags({ goals, suits }: { goals: Goal[]; suits: Suit[] }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  if (goals.length === 0 && suits.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="item-tags">
      {goals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
            <Target className="size-4" aria-hidden />
            {t("library.tags.goals")}
          </span>
          {goals.map((g, i) => (
            <Chip key={i} tone="focus">
              {goalLabel(g, optionLabel)}
            </Chip>
          ))}
        </div>
      )}
      {suits.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
            <Users className="size-4" aria-hidden />
            {t("library.tags.suits")}
          </span>
          {suits.map((s, i) => (
            <Chip key={i} tone="helps">
              {suitLabel(s, optionLabel)}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomAdder({ onAdd, disabled }: { onAdd: (text: string) => void; disabled: boolean }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        dir="auto"
        maxLength={MAX_CUSTOM}
        value={text}
        disabled={disabled}
        placeholder={t("library.tags.ownWords")}
        aria-label={t("library.tags.ownWords")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
      <Button variant="outline" size="sm" onClick={add} disabled={disabled || !text.trim()} icon={<Plus className="size-4" aria-hidden />}>
        {t("library.tags.add")}
      </Button>
    </div>
  );
}

function Customs<T extends { custom: string }>({ items, onRemove }: { items: T[]; onRemove: (i: T) => void }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((c) => (
        <li key={c.custom}>
          <span className="inline-flex min-h-11 items-center gap-1 rounded-sm border-2 border-brand bg-brand-soft ps-3 pe-1 text-sm font-semibold text-ink">
            <span dir="auto">{c.custom}</span>
            <button
              type="button"
              onClick={() => onRemove(c)}
              aria-label={t("library.tags.remove", { name: c.custom })}
              className="inline-flex size-9 items-center justify-center rounded-sm hover:bg-tray"
            >
              <X className="size-4" aria-hidden />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Admin: goals as toggle chips (focus_suggestions) plus own wording. */
export function GoalPicker({ value, onChange }: { value: Goal[]; onChange: (v: Goal[]) => void }) {
  const { t } = useI18n();
  const { list, optionLabel } = useOptions();
  const has = (key: string) => value.some((g) => "key" in g && g.key === key);
  const full = value.length >= MAX_TAGS;
  const toggle = (key: string) => onChange(has(key) ? value.filter((g) => !("key" in g && g.key === key)) : [...value, { key }]);
  const customs = value.filter((g): g is { custom: string } => "custom" in g);
  return (
    <fieldset className="space-y-3" data-testid="goal-picker">
      <legend className="text-base font-semibold text-ink">{t("library.tags.goals")}</legend>
      <p className="text-sm text-ink-muted">{t("library.tags.goalsHint")}</p>
      <div className="flex flex-wrap gap-2">
        {list("focus_suggestions").map((o) => (
          <ToggleChip key={o.key} tone="focus" selected={has(o.key)} disabled={full && !has(o.key)} onToggle={() => toggle(o.key)}>
            {optionLabel("focus_suggestions", o.key)}
          </ToggleChip>
        ))}
      </div>
      <Customs items={customs} onRemove={(c) => onChange(value.filter((g) => g !== c))} />
      <CustomAdder disabled={full} onAdd={(text) => !customs.some((c) => c.custom === text) && onChange([...value, { custom: text }])} />
    </fieldset>
  );
}

/** Admin: which children it suits, grouped by profile list, plus own wording. */
export function SuitsPicker({ value, onChange }: { value: Suit[]; onChange: (v: Suit[]) => void }) {
  const { t } = useI18n();
  const { list, optionLabel } = useOptions();
  const has = (l: string, key: string) => value.some((s) => "key" in s && s.list === l && s.key === key);
  const full = value.length >= MAX_TAGS;
  const toggle = (l: string, key: string) =>
    onChange(has(l, key) ? value.filter((s) => !("key" in s && s.list === l && s.key === key)) : [...value, { list: l, key }]);
  const customs = value.filter((s): s is { custom: string } => "custom" in s);
  return (
    <fieldset className="space-y-3" data-testid="suits-picker">
      <legend className="text-base font-semibold text-ink">{t("library.tags.suits")}</legend>
      <p className="text-sm text-ink-muted">{t("library.tags.suitsHint")}</p>
      {SUITS_LISTS.map((l) => (
        <div key={l} className="space-y-1.5">
          <p className="text-sm font-medium text-ink-muted">{t(`library.tags.lists.${l}`)}</p>
          <div className="flex flex-wrap gap-2">
            {list(l).map((o) => (
              <ToggleChip key={o.key} tone="helps" selected={has(l, o.key)} disabled={full && !has(l, o.key)} onToggle={() => toggle(l, o.key)}>
                {optionLabel(l, o.key)}
              </ToggleChip>
            ))}
          </div>
        </div>
      ))}
      <Customs items={customs} onRemove={(c) => onChange(value.filter((s) => s !== c))} />
      <CustomAdder disabled={full} onAdd={(text) => !customs.some((c) => c.custom === text) && onChange([...value, { custom: text }])} />
    </fieldset>
  );
}

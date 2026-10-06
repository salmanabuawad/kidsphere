import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { ToggleChip } from "@/components/ui/Chip";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import type { RegistryItem } from "@/lib/sourceModel";
import { useSourceModel } from "@/lib/sourceModel";
import { cn } from "@/lib/utils";
import { asItems, type ChildBasics, type Item } from "../api";
import { ItemsField, KeysField, SingleField } from "../fields";
import { asStrings, fieldOf, getPath, isObj, localized, optionsOf, partsOf, str, type SectionData } from "./model";

export const TEXT_MAX = 4000;
const OTHER_MAX = 500;

/** Remove empty strings / lists / objects so an untouched answer is not stored. */
function compact<T extends Record<string, unknown>>(obj: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

export function LongText({ value, onChange, label, rows = 3, max = TEXT_MAX }: { value: string; onChange: (v: string | undefined) => void; label: string; rows?: number; max?: number }) {
  return <Textarea rows={rows} value={value} maxLength={max} aria-label={label} onChange={(e) => onChange(e.target.value || undefined)} />;
}

/** Options of one list plus "Other" with its own words ({selected, other}). */
export function ChoiceOther({ list, value, onChange, otherLabel }: { list: string; value: unknown; onChange: (v: unknown) => void; otherLabel: string }) {
  const { t } = useI18n();
  const { list: options, labelOf } = useOptions();
  const v = isObj(value) ? value : {};
  const selected = asStrings(v.selected);
  const other = str(v.other);
  const listHasOther = options(list).some((o) => o.key === "other");
  const [open, setOpen] = useState(false);
  const otherOn = selected.includes("other") || !!other || open;
  const emit = (sel: string[], text: string) => onChange(compact({ selected: sel, other: text }));
  const otherOption = options(list).find((o) => o.key === "other");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options(list)
          .filter((o) => o.key !== "other")
          .map((o) => (
            <ToggleChip
              key={o.key}
              icon={o.icon}
              selected={selected.includes(o.key)}
              onToggle={() => emit(selected.includes(o.key) ? selected.filter((k) => k !== o.key) : [...selected, o.key], other)}
            >
              {labelOf(o)}
            </ToggleChip>
          ))}
        <ToggleChip
          selected={otherOn}
          icon={otherOption?.icon}
          onToggle={() => {
            if (otherOn) {
              setOpen(false);
              emit(selected.filter((k) => k !== "other"), "");
            } else {
              setOpen(true);
              if (listHasOther) emit([...selected, "other"], other);
            }
          }}
        >
          {otherOption ? labelOf(otherOption) : t("wizard.questionnaire.other")}
        </ToggleChip>
      </div>
      {otherOn && (
        <Input
          dir="auto"
          value={other}
          maxLength={OTHER_MAX}
          aria-label={otherLabel}
          placeholder={otherLabel}
          onChange={(e) => emit(listHasOther && !selected.includes("other") ? [...selected, "other"] : selected, e.target.value)}
        />
      )}
    </div>
  );
}

/** Yes / No with a follow-up text that opens after "yes"; optional chips (Q7 strengths). */
export function YesNoText({
  value,
  onChange,
  textLabel,
  keys,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  textLabel: string;
  keys?: { field: string; list: string };
}) {
  const v = isObj(value) ? value : {};
  const answer = str(v.value) || undefined;
  const text = str(v.text);
  const chosen = keys ? asStrings(v[keys.field]) : [];
  const emit = (patch: Record<string, unknown>) => onChange(compact({ ...v, ...patch }));
  return (
    <div className="space-y-3">
      <SingleField list="yes_no" value={answer} onChange={(x) => emit({ value: x })} />
      {(answer === "yes" || !!text || chosen.length > 0) && (
        <div className="space-y-3 border-s-2 border-line ps-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{textLabel}</span>
            <Textarea rows={2} value={text} maxLength={TEXT_MAX} onChange={(e) => emit({ text: e.target.value })} />
          </label>
          {keys && <KeysField list={keys.list} value={chosen} tone="strength" onChange={(k) => emit({ [keys.field]: k })} />}
        </div>
      )}
    </div>
  );
}

/** Free text with optional option chips ({text, keys}). */
export function TextKeys({ value, onChange, list, keysField = "keys", label }: { value: unknown; onChange: (v: unknown) => void; list: string; keysField?: string; label: string }) {
  const v = isObj(value) ? value : {};
  const emit = (patch: Record<string, unknown>) => onChange(compact({ ...v, ...patch }));
  return (
    <div className="space-y-3">
      <LongText label={label} value={str(v.text)} onChange={(text) => emit({ text })} rows={2} />
      <KeysField list={list} value={asStrings(v[keysField])} tone="helps" onChange={(keys) => emit({ [keysField]: keys })} />
    </div>
  );
}

/** Several reactions; an exclusive one ("easily") clears the others and the other way round. */
export function MultiExclusive({ value, onChange, list, exclusive }: { value: unknown; onChange: (v: unknown) => void; list: string; exclusive: string[] }) {
  const { list: options, labelOf } = useOptions();
  const selected = asStrings(isObj(value) ? value.selected : undefined);
  const toggle = (key: string) => {
    let next: string[];
    if (selected.includes(key)) next = selected.filter((k) => k !== key);
    else if (exclusive.includes(key)) next = [key];
    else next = [...selected.filter((k) => !exclusive.includes(k)), key];
    onChange(next.length ? { selected: next } : undefined);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options(list).map((o) => (
        <ToggleChip key={o.key} icon={o.icon} selected={selected.includes(o.key)} onToggle={() => toggle(o.key)}>
          {labelOf(o)}
        </ToggleChip>
      ))}
    </div>
  );
}

/** Q22: another language at home? Yes → which languages (+ a name when "other"). */
export function HomeLanguage({ value, onChange, otherLabel }: { value: unknown; onChange: (v: unknown) => void; otherLabel: string }) {
  const v = isObj(value) ? value : {};
  const answer = str(v.value) || undefined;
  const languages = asStrings(v.languages);
  const emit = (patch: Record<string, unknown>) => onChange(compact({ ...v, ...patch }));
  return (
    <div className="space-y-3">
      <SingleField list="yes_no" value={answer} onChange={(x) => emit({ value: x, ...(x === "yes" ? {} : { languages: [], other_text: "" }) })} />
      {answer === "yes" && (
        <div className="space-y-3 border-s-2 border-line ps-4">
          <KeysField list="languages" value={languages} onChange={(k) => emit({ languages: k })} />
          {languages.includes("other") && (
            <Input dir="auto" value={str(v.other_text)} maxLength={OTHER_MAX} aria-label={otherLabel} placeholder={otherLabel} onChange={(e) => emit({ other_text: e.target.value })} />
          )}
        </div>
      )}
    </div>
  );
}

/** PW5: the questionnaire's 8-row table, Independent / Needs help (+ optional "a little / a lot"). */
export function LevelsTable({
  item,
  data,
  setField,
}: {
  item: RegistryItem;
  data: SectionData;
  setField: (field: string, value: unknown) => void;
}) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { list: options, labelOf } = useOptions();
  const rows = partsOf(sm.registry("parent_questionnaire"), item);
  const levels = isObj(data.levels_pq) ? data.levels_pq : {};
  const amounts = isObj(data.help_amount) ? data.help_amount : {};
  const levelOptions = options(optionsOf(item) || "pq_independence_levels");
  const amountOptions = options(str(item.amount_options) || "pq_help_amount");
  const set = (area: string, level: string | undefined) => {
    const next = { ...levels };
    if (level) next[area] = level;
    else delete next[area];
    setField("levels_pq", Object.keys(next).length ? next : undefined);
    if (level !== "needs_help" && area in amounts) {
      const a = { ...amounts };
      delete a[area];
      setField("help_amount", Object.keys(a).length ? a : undefined);
    }
  };
  const setAmount = (area: string, amount: string | undefined) => {
    const a = { ...amounts };
    if (amount) a[area] = amount;
    else delete a[area];
    setField("help_amount", Object.keys(a).length ? a : undefined);
  };
  return (
    <div className="divide-y divide-line rounded-md border border-line" role="group" aria-label={sm.label(item)}>
      {rows.map((row) => {
        const area = str(row.area);
        const current = str(levels[area]) || undefined;
        return (
          <div key={row.id} className="space-y-2 p-3" data-row={area}>
            <div className="sm:flex sm:items-center sm:gap-3">
              <p className="mb-2 font-medium text-ink sm:mb-0 sm:w-44 sm:shrink-0" dir="auto">
                {sm.label(row)}
              </p>
              <div className="grid flex-1 grid-cols-2 gap-1 rounded-md bg-tray p-1" role="radiogroup" aria-label={sm.label(row)}>
                {levelOptions.map((lvl) => {
                  const on = current === lvl.key;
                  return (
                    <button
                      key={lvl.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set(area, on ? undefined : lvl.key)}
                      className={cn(
                        "flex min-h-11 items-center justify-center rounded-md border-2 px-2 py-1.5 text-sm leading-tight transition-colors",
                        on ? "border-brand bg-surface font-semibold text-ink shadow-lip" : "border-transparent font-medium text-ink-muted hover:text-ink",
                      )}
                    >
                      <span dir="auto">{labelOf(lvl)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {current === "needs_help" && (
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("wizard.questionnaire.howMuchHelp")}>
                <span className="text-caption text-ink-muted">{t("wizard.questionnaire.howMuchHelp")}</span>
                {amountOptions.map((a) => (
                  <ToggleChip key={a.key} single selected={amounts[area] === a.key} onToggle={() => setAmount(area, amounts[area] === a.key ? undefined : a.key)}>
                    {labelOf(a)}
                  </ToggleChip>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Q38: what the family hopes the child develops this year, one box per area + another area. */
export function DevelopField({ item, value, onChange }: { item: RegistryItem; value: unknown; onChange: (v: unknown) => void }) {
  const sm = useSourceModel();
  const v = isObj(value) ? value : {};
  const parts = partsOf(sm.registry("parent_questionnaire"), item);
  const emit = (area: string, box: Record<string, unknown> | undefined) => {
    const next: Record<string, unknown> = { ...v };
    if (box) next[area] = box;
    else delete next[area];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="space-y-3">
      {parts.map((p) => {
        const area = str(p.area);
        const box = isObj(v[area]) ? v[area] : {};
        if (p.kind === "develop_other") {
          const areaLabel = sm.label({ label: localized(p.area_label) }) || sm.label(p);
          return (
            <div key={p.id} className="space-y-1.5 rounded-md bg-tray p-3">
              <span className="text-sm font-semibold text-ink">{sm.label(p)}</span>
              <Input dir="auto" value={str(box.area)} maxLength={OTHER_MAX} aria-label={areaLabel} placeholder={areaLabel} onChange={(e) => emit(area, compact({ ...box, area: e.target.value }))} />
              <Textarea rows={2} value={str(box.text)} maxLength={TEXT_MAX} aria-label={sm.label(p)} onChange={(e) => emit(area, compact({ ...box, text: e.target.value }))} />
            </div>
          );
        }
        return (
          <label key={p.id} className="block space-y-1.5">
            <span className="text-sm font-semibold text-ink">{sm.label(p)}</span>
            <Textarea rows={2} value={str(box.text)} maxLength={TEXT_MAX} onChange={(e) => emit(area, compact({ text: e.target.value }))} />
          </label>
        );
      })}
    </div>
  );
}

type ParentRow = { name: string; relation?: string };

/** PW1: the parents' or guardians' names (editable; the child's own details are read-only). */
export function ParentsField({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const { t } = useI18n();
  const { list: options, labelOf } = useOptions();
  const rows: ParentRow[] = Array.isArray(value) ? value.filter(isObj).map((r) => ({ name: str(r.name), relation: str(r.relation) || undefined })) : [];
  const shown = rows.length ? rows : [{ name: "" }];
  const emit = (next: ParentRow[]) => {
    const clean = next.filter((r) => r.name.trim()).map((r) => (r.relation ? { name: r.name, relation: r.relation } : { name: r.name }));
    onChange(clean.length ? clean : undefined);
  };
  const [draft, setDraft] = useState<ParentRow[] | null>(null);
  const list = draft ?? shown;
  const change = (i: number, patch: Partial<ParentRow>) => {
    const next = list.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setDraft(next);
    emit(next);
  };
  return (
    <div className="space-y-2">
      {list.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <Input
            dir="auto"
            className="sm:flex-1"
            value={row.name}
            maxLength={120}
            aria-label={t("wizard.questionnaire.parentName")}
            placeholder={t("wizard.questionnaire.parentName")}
            onChange={(e) => change(i, { name: e.target.value })}
          />
          <div className="w-full sm:w-44">
            <Select value={row.relation ?? ""} aria-label={t("wizard.questionnaire.relation")} onChange={(e) => change(i, { relation: e.target.value || undefined })}>
              <option value="">{t("wizard.questionnaire.relation")}</option>
              {options("relations").map((o) => (
                <option key={o.key} value={o.key}>
                  {labelOf(o)}
                </option>
              ))}
            </Select>
          </div>
          {list.length > 1 && (
            <IconButton
              variant="ghost"
              label={t("common.remove")}
              onClick={() => {
                const next = list.filter((_, j) => j !== i);
                setDraft(next);
                emit(next);
              }}
            >
              <Trash2 aria-hidden />
            </IconButton>
          )}
        </div>
      ))}
      {list.length < 4 && (
        <Button variant="ghost" size="sm" icon={<Plus aria-hidden />} onClick={() => setDraft([...list, { name: "" }])}>
          {t("wizard.questionnaire.addParent")}
        </Button>
      )}
    </div>
  );
}

export function ChildFact({ item, child }: { item: RegistryItem; child: ChildBasics | undefined }) {
  const { formatAge } = useFormat();
  const field = fieldOf(item);
  let text: ReactNode = "—";
  if (child) {
    if (field === "name") text = <bdi>{child.preferred_name?.trim() || child.name}</bdi>;
    else if (field === "age") text = <bdi className="tabular">{formatAge(child.birth_date)}</bdi>;
    else if (field === "kindergarten") text = <bdi>{child.class?.kindergarten || child.class?.name || "—"}</bdi>;
  }
  return <p className="text-base text-ink">{text}</p>;
}

/** The control for one questionnaire question (top-level field of its section). */
export function QuestionControl({
  item,
  data,
  setField,
  child,
}: {
  item: RegistryItem;
  data: SectionData;
  setField: (field: string, value: unknown) => void;
  child: ChildBasics | undefined;
}) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const field = fieldOf(item);
  const value = getPath(data, field);
  const label = sm.label(item);
  const set = (v: unknown) => setField(field, v);
  const list = optionsOf(item);
  const otherPart = partsOf(sm.registry("parent_questionnaire"), item)[0];
  switch (item.kind) {
    case "text":
      return <LongText label={label} value={str(value)} onChange={set} />;
    case "items": {
      const max = typeof item.max === "number" ? item.max : undefined;
      return <ItemsField list={list} value={asItems(value)} max={max} tone="brand" onChange={(items: Item[]) => set(items.length ? items : undefined)} />;
    }
    case "choice_other":
      return <ChoiceOther list={list} value={value} onChange={set} otherLabel={otherPart ? sm.label(otherPart) : t("wizard.questionnaire.other")} />;
    case "yes_no_text":
      return <YesNoText value={value} onChange={set} textLabel={sm.label({ label: localized(item.text_label) }) || label} />;
    case "yes_no_text_keys":
      return (
        <YesNoText
          value={value}
          onChange={set}
          textLabel={sm.label({ label: localized(item.text_label) }) || label}
          keys={{ field: str(item.keys_field) || "keys", list }}
        />
      );
    case "text_chips": {
      const chips = isObj(item.chips) ? item.chips : {};
      const chipsField = str(chips.field);
      return (
        <div className="space-y-3">
          <LongText label={label} value={str(value)} onChange={set} rows={2} />
          {chipsField && (
            <ItemsField
              list={str(chips.options)}
              custom={false}
              tone="helps"
              value={asItems(data[chipsField])}
              onChange={(items: Item[]) => setField(chipsField, items.length ? items : undefined)}
            />
          )}
        </div>
      );
    }
    case "single":
      return <SingleField list={list} value={str(value) || undefined} onChange={(x) => set(x)} />;
    case "text_keys":
      return <TextKeys value={value} onChange={set} list={list} keysField={str(item.keys_field) || "keys"} label={label} />;
    case "multi_exclusive":
      return <MultiExclusive value={value} onChange={set} list={list} exclusive={asStrings(item.exclusive)} />;
    case "home_language":
      return <HomeLanguage value={value} onChange={set} otherLabel={otherPart ? sm.label(otherPart) : t("wizard.questionnaire.other")} />;
    case "levels_table":
      return <LevelsTable item={item} data={data} setField={setField} />;
    case "develop":
      return <DevelopField item={item} value={value} onChange={set} />;
    case "parents":
      return <ParentsField value={value} onChange={set} />;
    case "child_fact":
      return <ChildFact item={item} child={child} />;
    default:
      return null;
  }
}

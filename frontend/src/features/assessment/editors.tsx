import { useState, type ReactNode } from "react";
import { ChevronDown, MessageSquarePlus, Minus, Plus, Target, Trash2 } from "lucide-react";
import { Badge, Button, Field, IconButton, Input, Select, Textarea, ToggleChip } from "@/components/ui";
import { NotObserved, ProvenanceBadge } from "@/components/source";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { useFetch } from "@/lib/useFetch";
import { useSourceModel, type RegistryItem } from "@/lib/sourceModel";
import { cn } from "@/lib/utils";
import { SupportScale, observationsUrl, type ObservationList } from "@/features/observations";
import {
  LEVELS,
  MAX_NEEDS,
  type ApplyItem,
  type ApplyList,
  type AttentionContext,
  type Choice,
  type ChoicesText,
  type DayStage,
  type Domain,
  type DomainData,
  type HelpsText,
  type ItemRating,
  type Need,
  type SensoryRating,
  type StrengthSlot,
} from "./api";
import { domainHints, independenceHint, itemHint, type ParentSections } from "./parentHints";

export type EditorContext = {
  childId: string;
  parentSections: ParentSections;
  readOnly: boolean;
  /** Add teacher-observed items to the profile lists (POST …/apply). */
  apply: (list: ApplyList, items: ApplyItem[]) => void;
  applying: boolean;
  /** D13: make need #index a Current Focus. */
  promote: (index: number, need: Need) => void;
  promoting: boolean;
  /** index → focus title for needs that are already a Current Focus. */
  promoted: Map<number, string>;
  /** Unsaved changes in this card (promotion needs a saved document). */
  dirty: boolean;
};

type EditorProps = { domain: Domain; data: DomainData; onChange: (d: DomainData) => void; ctx: EditorContext };

// --------------------------------------------------------------------------- small parts

/** Remove undefined and empty values so the stored document stays minimal. */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(compact).filter((v) => !isEmpty(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const c = compact(v);
      if (!isEmpty(c)) out[k] = c;
    }
    return out as T;
  }
  return value;
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

function choiceKey(c: Choice) {
  return c.key ? `k:${c.key}` : `c:${c.custom}`;
}

function SubTitle({ children }: { children: ReactNode }) {
  return <h4 className="text-sm font-semibold text-ink">{children}</h4>;
}

export function ParentHint({ values, label }: { values: string[]; label?: string }) {
  if (!values.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-hint="parent">
      <ProvenanceBadge kind="parent_said" />
      {label && <span className="text-caption text-ink-muted">{label}:</span>}
      <span className="text-caption text-ink" dir="auto">
        {values.join(" · ")}
      </span>
    </div>
  );
}

/** Multi-select chips over one option list (stored as [{key}]); "other" is left out. */
function ChoiceChips({
  list,
  value,
  onChange,
  disabled,
  tone = "brand",
  label,
}: {
  list: string;
  value: Choice[] | undefined;
  onChange: (v: Choice[]) => void;
  disabled?: boolean;
  tone?: "brand" | "helps" | "strength" | "interest";
  label: string;
}) {
  const { list: options, labelOf } = useOptions();
  const current = value ?? [];
  const keys = new Set(current.filter((c) => c.key).map((c) => c.key));
  const toggle = (key: string) => onChange(keys.has(key) ? current.filter((c) => c.key !== key) : [...current, { key }]);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options(list)
        .filter((o) => o.key !== "other")
        .map((o) => (
          <ToggleChip key={o.key} tone={tone} icon={o.icon} selected={keys.has(o.key)} disabled={disabled} onToggle={() => toggle(o.key)}>
            {labelOf(o)}
          </ToggleChip>
        ))}
      {current
        .filter((c) => c.custom)
        .map((c) => (
          <ToggleChip key={choiceKey(c)} tone={tone} selected disabled={disabled} onToggle={() => onChange(current.filter((x) => x !== c))}>
            {c.custom}
          </ToggleChip>
        ))}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  max,
  disabled,
  rows = 2,
  hint,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  max: number;
  disabled?: boolean;
  rows?: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(p) => <Textarea {...p} rows={rows} maxLength={max} disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

function ApplyButton({ ctx, list, items, label }: { ctx: EditorContext; list: ApplyList; items: ApplyItem[]; label: string }) {
  if (!items.length) return null;
  return (
    <Button size="sm" variant="soft" icon={<Plus aria-hidden />} loading={ctx.applying} onClick={() => ctx.apply(list, items)}>
      {label}
    </Button>
  );
}

const toApply = (choices: Choice[] | undefined, optionList?: string): ApplyItem[] =>
  (choices ?? []).map((c) => (c.key ? { key: c.key, ...(optionList ? { list: optionList } : {}) } : { custom: c.custom! }));

/** {items|helps: [{key}], text} over one option list, with an optional "Add to …" action. */
function ChoicesTextEditor({
  label,
  list,
  itemsKey,
  value,
  onChange,
  max,
  ctx,
  applyTo,
  tone,
}: {
  label: string;
  list: string;
  itemsKey: "items" | "helps";
  value: (ChoicesText & HelpsText) | undefined;
  onChange: (v: ChoicesText & HelpsText) => void;
  max: number;
  ctx: EditorContext;
  applyTo?: { list: ApplyList; label: string; optionList?: string };
  tone?: "brand" | "helps" | "strength" | "interest";
}) {
  const { t } = useI18n();
  const v = value ?? {};
  const chosen = (v[itemsKey] as Choice[] | undefined) ?? [];
  return (
    <div className="space-y-2.5">
      <SubTitle>{label}</SubTitle>
      <ChoiceChips list={list} label={label} tone={tone} value={chosen} disabled={ctx.readOnly} onChange={(items) => onChange({ ...v, [itemsKey]: items })} />
      <TextArea label={t("assessment.domain.inYourWords")} value={v.text} max={max} disabled={ctx.readOnly} onChange={(text) => onChange({ ...v, text })} />
      {applyTo && <ApplyButton ctx={ctx} list={applyTo.list} items={toApply(chosen, applyTo.optionList)} label={applyTo.label} />}
    </div>
  );
}

function HelpsEditor({
  label,
  value,
  onChange,
  ctx,
  max = 500,
  apply,
}: {
  label: string;
  value: HelpsText | undefined;
  onChange: (v: HelpsText) => void;
  ctx: EditorContext;
  max?: number;
  apply?: boolean;
}) {
  const { t } = useI18n();
  return (
    <ChoicesTextEditor
      label={label}
      list="what_helps"
      itemsKey="helps"
      value={value}
      onChange={onChange}
      max={max}
      ctx={ctx}
      tone="helps"
      applyTo={apply ? { list: "what_helps", label: t("assessment.domain.addToWhatHelps"), optionList: "what_helps" } : undefined}
    />
  );
}

// --------------------------------------------------------------------------- level items (D1–D7, D10)

function useLevelOptions() {
  const { t } = useI18n();
  return LEVELS.map((k) => ({ key: k, label: t(`observations.supportLevels.${k}`) }));
}

function NoteField({ label, value, onChange, max, disabled }: { label: string; value?: string; onChange: (v: string) => void; max: number; disabled?: boolean }) {
  return (
    <Textarea
      aria-label={label}
      rows={2}
      maxLength={max}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-16"
    />
  );
}

function ItemRow({
  item,
  rating,
  onChange,
  ctx,
  hint,
}: {
  item: RegistryItem;
  rating: ItemRating | undefined;
  onChange: (r: ItemRating) => void;
  ctx: EditorContext;
  hint: string[];
}) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const options = useLevelOptions();
  const noteFirst = item.note_first === true;
  const [noteOpen, setNoteOpen] = useState(noteFirst || !!rating?.note);
  const label = sm.label(item);
  const note = (
    <NoteField
      label={t("assessment.domain.noteFor", { item: label })}
      value={rating?.note}
      max={500}
      disabled={ctx.readOnly}
      onChange={(v) => onChange({ ...rating, note: v })}
    />
  );
  return (
    <li className="space-y-2 py-3" data-item={String(item.item_key)}>
      <div className="flex items-start justify-between gap-2">
        <p className="pt-2 font-medium text-ink" dir="auto">
          {label}
        </p>
        {!noteFirst && (
          <IconButton
            size="sm"
            label={t(noteOpen ? "assessment.domain.hideNote" : "assessment.domain.addNote") + `: ${label}`}
            aria-pressed={noteOpen}
            onClick={() => setNoteOpen((o) => !o)}
          >
            <MessageSquarePlus aria-hidden />
          </IconButton>
        )}
      </div>
      <ParentHint values={hint} />
      {noteFirst && note}
      {noteFirst && <p className="text-caption text-ink-muted">{t("assessment.domain.optionalLevel")}</p>}
      <SupportScale
        label={t("assessment.domain.levelFor", { item: label })}
        options={options}
        value={rating?.level}
        disabled={ctx.readOnly}
        onChange={(v) => onChange({ ...rating, level: (v ?? undefined) as ItemRating["level"] })}
      />
      {!noteFirst && noteOpen && note}
    </li>
  );
}

export function ItemRows({ domain, data, onChange, ctx }: EditorProps) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { optionLabel } = useOptions();
  const rows = sm.items("observation_model", domain).filter((i) => i.kind === "level_item" || i.kind === "subgroup");
  const items = (data.items ?? {}) as Record<string, ItemRating>;
  const set = (key: string, r: ItemRating) => onChange({ ...data, items: { ...items, [key]: r } });
  return (
    <div>
      <p className="text-caption font-semibold text-ink-muted">{t("assessment.domain.levelHeader")}</p>
      <ul className="divide-y divide-line">
        {rows.map((row) =>
          row.kind === "subgroup" ? (
            <li key={row.id} className="pt-4 pb-1">
              <SubTitle>{sm.label(row)}</SubTitle>
            </li>
          ) : (
            <ItemRow
              key={row.id}
              item={row}
              rating={items[String(row.item_key)]}
              ctx={ctx}
              hint={itemHint(domain, String(row.item_key), ctx.parentSections, optionLabel)}
              onChange={(r) => set(String(row.item_key), r)}
            />
          ),
        )}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------------------- D8 independence (binary first)

export function IndependenceRows({ domain, data, onChange, ctx }: EditorProps) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { optionLabel } = useOptions();
  const full = useLevelOptions();
  const rows = sm.items("observation_model", domain).filter((i) => i.kind === "level_item");
  const items = (data.items ?? {}) as Record<string, ItemRating>;
  const [more, setMore] = useState(() => Object.values(items).some((r) => r.level === "significant_support" || r.level === "not_observed"));
  const binary = [
    { key: "independent", label: t("assessment.levels.independent") },
    { key: "some_support", label: t("assessment.levels.needsHelp") },
  ];
  const set = (key: string, r: ItemRating) => onChange({ ...data, items: { ...items, [key]: r } });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption font-semibold text-ink-muted">{t("assessment.domain.levelHeader")}</p>
        <Button size="sm" variant="ghost" aria-pressed={more} onClick={() => setMore((m) => !m)} icon={more ? <Minus aria-hidden /> : <Plus aria-hidden />}>
          {t(more ? "assessment.levels.fewer" : "assessment.levels.more")}
        </Button>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const key = String(row.item_key);
          const r = items[key];
          const label = sm.label(row);
          const parent = independenceHint(key, ctx.parentSections);
          const parentValue = parent?.binary
            ? t(parent.binary === "independent" ? "assessment.levels.independent" : "assessment.levels.needsHelp")
            : parent?.level
              ? optionLabel("support_levels", parent.level)
              : null;
          return (
            <li key={row.id} className="space-y-2 py-3" data-item={key}>
              <p className="font-medium text-ink" dir="auto">
                {label}
              </p>
              {parentValue && <ParentHint values={[parentValue]} />}
              <SupportScale
                label={t("assessment.domain.levelFor", { item: label })}
                options={more ? full : binary}
                value={r?.level}
                disabled={ctx.readOnly}
                onChange={(v) => set(key, { ...r, level: (v ?? undefined) as ItemRating["level"] })}
              />
              <Input
                aria-label={t("assessment.domain.noteFor", { item: label })}
                placeholder={t("assessment.domain.note")}
                dir="auto"
                maxLength={300}
                disabled={ctx.readOnly}
                value={r?.note ?? ""}
                onChange={(e) => set(key, { ...r, note: e.target.value })}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------------------- D9 the environment (no levels)

export function SensoryRows({ domain, data, onChange, ctx }: EditorProps) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { list, labelOf } = useOptions();
  const rows = sm.items("observation_model", domain).filter((i) => i.kind === "sensory_item");
  const items = (data.items ?? {}) as Record<string, SensoryRating>;
  const set = (key: string, r: SensoryRating) => onChange({ ...data, items: { ...items, [key]: r } });
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const key = String(row.item_key);
        const r = items[key] ?? {};
        const label = sm.label(row);
        const open = r.effect === "affects" || r.effect === "sometimes" || !!r.reaction_text || !!r.helps?.length;
        return (
          <li key={row.id} className="space-y-2 py-3" data-item={key}>
            <p className="font-medium text-ink" dir="auto">
              {label}
            </p>
            <div role="radiogroup" aria-label={t("assessment.sensory.effectFor", { item: label })} className="flex flex-wrap gap-2">
              {list("sensory_effects").map((e) => (
                <ToggleChip
                  key={e.key}
                  single
                  selected={r.effect === e.key}
                  disabled={ctx.readOnly}
                  onToggle={() => set(key, { ...r, effect: r.effect === e.key ? undefined : e.key })}
                >
                  {labelOf(e)}
                </ToggleChip>
              ))}
            </div>
            {open && (
              <div className="space-y-2 ps-3">
                <Input
                  aria-label={t("assessment.sensory.reactionFor", { item: label })}
                  placeholder={t("assessment.sensory.reaction")}
                  dir="auto"
                  maxLength={500}
                  disabled={ctx.readOnly}
                  value={r.reaction_text ?? ""}
                  onChange={(e) => set(key, { ...r, reaction_text: e.target.value })}
                />
                <p className="text-caption text-ink-muted">{t("assessment.sensory.helps")}</p>
                <ChoiceChips
                  list="what_helps"
                  tone="helps"
                  label={t("assessment.sensory.helps")}
                  value={r.helps}
                  disabled={ctx.readOnly}
                  onChange={(helps) => set(key, { ...r, helps })}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// --------------------------------------------------------------------------- D11 day map

function StageEvidence({ childId, stage }: { childId: string; stage: string }) {
  const { t } = useI18n();
  const { data } = useFetch<ObservationList>(observationsUrl(childId), { context: stage, limit: 3 });
  const rows = data?.observations ?? [];
  return (
    <div className="space-y-1.5 rounded-md bg-tray p-3">
      <p className="text-caption font-semibold text-ink-muted">{t("assessment.dayMap.evidence")}</p>
      {data && rows.length === 0 && <p className="text-caption text-ink-muted">{t("assessment.dayMap.noEvidence")}</p>}
      <ul className="space-y-1">
        {rows.map((o) => (
          <li key={o.id} className="text-sm text-ink" dir="auto">
            {o.observation ?? o.content_title ?? ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DayMap({ domain, data, onChange, ctx }: EditorProps) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const rows = sm.items("observation_model", domain);
  const stages = rows.filter((i) => i.kind === "stage");
  const columns = new Map(rows.filter((i) => i.kind === "stage_column").map((c) => [String(c.field), sm.label(c)]));
  const all = (data.stages ?? {}) as Record<string, DayStage>;
  const [open, setOpen] = useState<string | null>(null);
  const set = (key: string, s: DayStage) => onChange({ ...data, stages: { ...all, [key]: s } });
  return (
    <ul className="divide-y divide-line">
      {stages.map((row) => {
        const key = String(row.item_key);
        const s = all[key] ?? {};
        const isOpen = open === key;
        const filled = !isEmpty(compact(s));
        const label = sm.label(row);
        return (
          <li key={row.id} data-stage={key}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : key)}
              className="flex min-h-12 w-full items-center justify-between gap-2 py-2 text-start"
            >
              <span className="font-medium text-ink" dir="auto">
                {label}
              </span>
              <span className="flex items-center gap-2">
                {filled ? <Badge tone="neutral">{t("assessment.dayMap.filled")}</Badge> : <NotObserved />}
                <ChevronDown className={cn("size-5 text-ink-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
              </span>
            </button>
            {isOpen && (
              <div className="grid gap-4 pb-4 lg:grid-cols-2">
                <TextArea label={columns.get("succeeds") ?? ""} value={s.succeeds} max={500} disabled={ctx.readOnly} onChange={(v) => set(key, { ...s, succeeds: v })} />
                <TextArea label={columns.get("difficult") ?? ""} value={s.difficult} max={500} disabled={ctx.readOnly} onChange={(v) => set(key, { ...s, difficult: v })} />
                <HelpsEditor label={columns.get("support_needed") ?? ""} value={s.support_needed} ctx={ctx} onChange={(v) => set(key, { ...s, support_needed: v })} />
                <HelpsEditor label={columns.get("what_helps") ?? ""} value={s.what_helps} ctx={ctx} apply onChange={(v) => set(key, { ...s, what_helps: v })} />
                <div className="lg:col-span-2">
                  <StageEvidence childId={ctx.childId} stage={key} />
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// --------------------------------------------------------------------------- D12 strengths

export function StrengthSlots({ domain, data, onChange, ctx }: EditorProps) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { list, labelOf } = useOptions();
  const rows = sm.items("observation_model", domain);
  const slots = rows.filter((i) => i.kind === "strength_slot");
  const rule = rows.find((i) => i.kind === "rule");
  const current = (Array.isArray(data.items) ? data.items : []) as StrengthSlot[];
  const filled = current.filter((s) => s.key || s.custom).length;
  const setSlot = (i: number, s: StrengthSlot) => {
    const next = slots.map((_, n) => (n === i ? s : (current[n] ?? {})));
    onChange({ ...data, items: next });
  };
  const fields = (data.fields ?? {}) as Record<string, ChoicesText>;
  const interestsItem = rows.find((i) => i.kind === "field" && i.field === "prominent_interests");
  const strengthItems = current.filter((s) => (s.list ?? "strengths") === "strengths" && (s.key || s.custom));
  const interestItems = current.filter((s) => s.list === "interests" && s.key);
  return (
    <div className="space-y-4">
      {rule && <p className="text-sm text-ink-muted">{sm.label(rule)}</p>}
      <ol className="space-y-3">
        {slots.map((row, i) => {
          const s = current[i] ?? {};
          const value = s.custom !== undefined ? "custom" : s.key ? `${s.list ?? "strengths"}:${s.key}` : "";
          const label = sm.label(row);
          return (
            <li key={row.id} className="space-y-2 rounded-md border border-line p-3" data-slot={i + 1}>
              <Field label={label}>
                {(p) => (
                  <Select
                    {...p}
                    disabled={ctx.readOnly}
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return setSlot(i, {});
                      if (v === "custom") return setSlot(i, { list: "strengths", custom: s.custom ?? "", note: s.note });
                      const [lst, key] = v.split(":") as ["strengths" | "interests", string];
                      setSlot(i, { list: lst, key, note: s.note, observation_ids: s.observation_ids });
                    }}
                  >
                    <option value="">{t("assessment.strengths.choose")}</option>
                    <optgroup label={t("assessment.strengths.strengthsGroup")}>
                      {list("strengths").map((o) => (
                        <option key={o.key} value={`strengths:${o.key}`}>
                          {labelOf(o)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t("assessment.strengths.interestsGroup")}>
                      {list("interests").map((o) => (
                        <option key={o.key} value={`interests:${o.key}`}>
                          {labelOf(o)}
                        </option>
                      ))}
                    </optgroup>
                    <option value="custom">{t("assessment.strengths.custom")}</option>
                  </Select>
                )}
              </Field>
              {value === "custom" && (
                <Input
                  aria-label={t("assessment.strengths.customFor", { slot: label })}
                  dir="auto"
                  maxLength={120}
                  disabled={ctx.readOnly}
                  value={s.custom ?? ""}
                  onChange={(e) => setSlot(i, { ...s, custom: e.target.value })}
                />
              )}
              {value && (
                <Input
                  aria-label={t("assessment.strengths.noteFor", { slot: label })}
                  placeholder={t("assessment.strengths.note")}
                  dir="auto"
                  maxLength={300}
                  disabled={ctx.readOnly}
                  value={s.note ?? ""}
                  onChange={(e) => setSlot(i, { ...s, note: e.target.value })}
                />
              )}
            </li>
          );
        })}
      </ol>
      {filled > 0 && filled < 3 && <p className="text-caption text-ink-muted">{t("assessment.warnings.strengths_below_3")}</p>}
      <div className="flex flex-wrap gap-2">
        <ApplyButton
          ctx={ctx}
          list="strengths"
          items={strengthItems.map((s) => (s.key ? { key: s.key } : { custom: s.custom!.trim() })).filter((x) => x.key || x.custom)}
          label={t("assessment.domain.addToStrengths")}
        />
        <ApplyButton ctx={ctx} list="interests" items={interestItems.map((s) => ({ key: s.key! }))} label={t("assessment.domain.addToInterests")} />
      </div>
      {interestsItem && (
        <ChoicesTextEditor
          label={sm.label(interestsItem)}
          list="interests"
          itemsKey="items"
          tone="interest"
          max={500}
          ctx={ctx}
          value={fields.prominent_interests}
          onChange={(v) => onChange({ ...data, fields: { ...fields, prominent_interests: v } })}
          applyTo={{ list: "interests", label: t("assessment.domain.addToInterests") }}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- D13 where to focus next

export function NeedCards({ domain, data, onChange, ctx }: EditorProps) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { list, labelOf, optionLabel } = useOptions();
  const rows = sm.items("observation_model", domain);
  const fieldLabel = (f: string) => {
    const item = rows.find((i) => i.kind === "need_field" && i.field === f);
    return item ? sm.label(item) : f;
  };
  const rule = rows.find((i) => i.kind === "rule");
  const needs = data.needs ?? [];
  const areas = needs.map((n) => n.area);
  const setNeeds = (next: Need[]) => onChange({ ...data, needs: next });
  const setNeed = (i: number, n: Need) => setNeeds(needs.map((x, k) => (k === i ? n : x)));
  const toggleArea = (area: string) =>
    setNeeds(areas.includes(area) ? needs.filter((n) => n.area !== area) : needs.length < MAX_NEEDS ? [...needs, { area }] : needs);
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">{rule ? sm.label(rule) : t("assessment.needs.choose")}</legend>
        <div className="flex flex-wrap gap-2">
          {list("need_areas").map((a) => (
            <ToggleChip
              key={a.key}
              tone="focus"
              icon={a.icon}
              selected={areas.includes(a.key)}
              disabled={ctx.readOnly || (!areas.includes(a.key) && needs.length >= MAX_NEEDS)}
              onToggle={() => toggleArea(a.key)}
            >
              {labelOf(a)}
            </ToggleChip>
          ))}
        </div>
        {needs.length >= MAX_NEEDS && <p className="text-caption mt-2 text-ink-muted">{t("assessment.needs.max")}</p>}
      </fieldset>
      {needs.map((n, i) => {
        const promoted = ctx.promoted.get(i);
        return (
          <section key={n.area} className="space-y-3 rounded-md border border-line p-3" data-need={n.area} aria-label={optionLabel("need_areas", n.area)}>
            <h4 className="font-display text-title font-semibold text-ink">{optionLabel("need_areas", n.area)}</h4>
            <TextArea label={fieldLabel("seeing")} value={n.seeing} max={1000} disabled={ctx.readOnly} onChange={(v) => setNeed(i, { ...n, seeing: v })} />
            <Field label={fieldLabel("how_often")}>
              {(p) => <Input {...p} dir="auto" maxLength={300} disabled={ctx.readOnly} value={n.how_often ?? ""} onChange={(e) => setNeed(i, { ...n, how_often: e.target.value })} />}
            </Field>
            <div className="space-y-2">
              <SubTitle>{fieldLabel("situations")}</SubTitle>
              <ContextChips
                label={fieldLabel("situations")}
                value={n.situations?.contexts}
                disabled={ctx.readOnly}
                onChange={(contexts) => setNeed(i, { ...n, situations: { ...n.situations, contexts } })}
              />
              <Input
                aria-label={`${fieldLabel("situations")}: ${t("assessment.domain.inYourWords")}`}
                dir="auto"
                maxLength={500}
                disabled={ctx.readOnly}
                value={n.situations?.text ?? ""}
                onChange={(e) => setNeed(i, { ...n, situations: { ...n.situations, text: e.target.value } })}
              />
            </div>
            <TextArea label={fieldLabel("what_seems_harder")} value={n.what_seems_harder} max={500} disabled={ctx.readOnly} onChange={(v) => setNeed(i, { ...n, what_seems_harder: v })} />
            <TextArea label={fieldLabel("already_tried")} value={n.already_tried} max={500} disabled={ctx.readOnly} onChange={(v) => setNeed(i, { ...n, already_tried: v })} />
            <HelpsEditor label={fieldLabel("what_helped")} value={n.what_helped} ctx={ctx} onChange={(v) => setNeed(i, { ...n, what_helped: v })} />
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              {promoted ? (
                <Badge tone="focus" icon={<Target aria-hidden />}>
                  <span dir="auto">{t("assessment.needs.isFocus", { title: promoted })}</span>
                </Badge>
              ) : (
                <>
                  <Button size="sm" variant="secondary" icon={<Target aria-hidden />} disabled={ctx.dirty} loading={ctx.promoting} onClick={() => ctx.promote(i, n)}>
                    {t("assessment.needs.makeFocus")}
                  </Button>
                  {ctx.dirty && <span className="text-caption text-ink-muted">{t("assessment.needs.saveFirst")}</span>}
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ContextChips({ label, value, onChange, disabled }: { label: string; value?: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const { list, labelOf } = useOptions();
  const current = value ?? [];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {list("observation_contexts")
        .filter((c) => c.key !== "other")
        .map((c) => (
          <ToggleChip
            key={c.key}
            icon={c.icon}
            selected={current.includes(c.key)}
            disabled={disabled}
            onToggle={() => onChange(current.includes(c.key) ? current.filter((x) => x !== c.key) : [...current, c.key])}
          >
            {labelOf(c)}
          </ToggleChip>
        ))}
    </div>
  );
}

// --------------------------------------------------------------------------- domain fields

function AttentionSpanEditor({ label, value, onChange, ctx }: { label: string; value: { by_context?: AttentionContext[]; text?: string } | undefined; onChange: (v: { by_context?: AttentionContext[]; text?: string }) => void; ctx: EditorContext }) {
  const { t } = useI18n();
  const { list, labelOf } = useOptions();
  const v = value ?? {};
  const rows = v.by_context ?? [];
  const setRow = (i: number, r: AttentionContext) => onChange({ ...v, by_context: rows.map((x, k) => (k === i ? r : x)) });
  return (
    <div className="space-y-2.5">
      <SubTitle>{label}</SubTitle>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_1fr_auto] sm:items-end">
            <Field label={t("assessment.attention.context")}>
              {(p) => (
                <Select {...p} disabled={ctx.readOnly} value={r.context} onChange={(e) => setRow(i, { ...r, context: e.target.value })}>
                  {list("observation_contexts").map((c) => (
                    <option key={c.key} value={c.key}>
                      {labelOf(c)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("assessment.attention.minutes")}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  dir="ltr"
                  min={1}
                  max={90}
                  disabled={ctx.readOnly}
                  value={r.approx_minutes ?? ""}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setRow(i, { ...r, approx_minutes: Number.isFinite(n) ? Math.min(90, Math.max(1, n)) : undefined });
                  }}
                />
              )}
            </Field>
            <Field label={t("assessment.attention.note")}>
              {(p) => <Input {...p} dir="auto" maxLength={300} disabled={ctx.readOnly} value={r.note ?? ""} onChange={(e) => setRow(i, { ...r, note: e.target.value })} />}
            </Field>
            {!ctx.readOnly && (
              <IconButton label={t("assessment.attention.remove")} onClick={() => onChange({ ...v, by_context: rows.filter((_, k) => k !== i) })}>
                <Trash2 aria-hidden />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      {!ctx.readOnly && rows.length < 10 && (
        <Button size="sm" variant="ghost" icon={<Plus aria-hidden />} onClick={() => onChange({ ...v, by_context: [...rows, { context: "group_time" }] })}>
          {t("assessment.attention.add")}
        </Button>
      )}
      <TextArea label={t("assessment.domain.inYourWords")} value={v.text} max={1000} disabled={ctx.readOnly} onChange={(text) => onChange({ ...v, text })} />
    </div>
  );
}

export function FieldEditor({ domain, item, data, onChange, ctx }: EditorProps & { item: RegistryItem }) {
  const { t } = useI18n();
  const { list, labelOf } = useOptions();
  const sm = useSourceModel();
  const field = String(item.field);
  const label = sm.label(item);
  const fields = (data.fields ?? {}) as Record<string, unknown>;
  const value = fields[field];
  const set = (v: unknown) => onChange({ ...data, fields: { ...fields, [field]: v } });
  const text = (max: number) => <TextArea label={label} value={value as string | undefined} max={max} disabled={ctx.readOnly} onChange={set} rows={3} />;
  const textObj = (max: number) => {
    const v = (value ?? {}) as { text?: string };
    return <TextArea label={label} value={v.text} max={max} disabled={ctx.readOnly} rows={3} onChange={(s) => set({ ...v, text: s })} />;
  };
  switch (`${domain}.${field}`) {
    case "emotional.what_makes_it_harder": {
      const v = (value ?? {}) as { text?: string; contexts?: string[] };
      return (
        <div className="space-y-2.5">
          <SubTitle>{label}</SubTitle>
          <ContextChips label={label} value={v.contexts} disabled={ctx.readOnly} onChange={(contexts) => set({ ...v, contexts })} />
          <TextArea label={t("assessment.domain.inYourWords")} value={v.text} max={1000} disabled={ctx.readOnly} onChange={(s) => set({ ...v, text: s })} />
        </div>
      );
    }
    case "emotional.what_helps_calm":
      return (
        <ChoicesTextEditor
          label={label}
          list="calming_helps"
          itemsKey="items"
          tone="helps"
          max={1000}
          ctx={ctx}
          value={value as ChoicesText}
          onChange={set}
          applyTo={{ list: "what_helps", label: t("assessment.domain.addToWhatHelps"), optionList: "calming_helps" }}
        />
      );
    case "social.main_observation":
    case "language.language_examples":
      return textObj(2000);
    case "executive_function.attention_span":
      return <AttentionSpanEditor label={label} value={value as { by_context?: AttentionContext[] }} onChange={set} ctx={ctx} />;
    case "play.preferred_play":
      return (
        <ChoicesTextEditor
          label={label}
          list="interests"
          itemsKey="items"
          tone="interest"
          max={1000}
          ctx={ctx}
          value={value as ChoicesText}
          onChange={set}
          applyTo={{ list: "interests", label: t("assessment.domain.addToInterests") }}
        />
      );
    case "gross_motor.avoids_physical_activity":
      return (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">{label}</legend>
          <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
            {list("yes_no").map((o) => (
              <ToggleChip key={o.key} single selected={value === o.key} disabled={ctx.readOnly} onToggle={() => set(value === o.key ? undefined : o.key)}>
                {labelOf(o)}
              </ToggleChip>
            ))}
          </div>
        </fieldset>
      );
    case "gross_motor.avoidance_details":
      return fields.avoids_physical_activity === "yes" || value ? text(1000) : null;
    case "fine_motor.strengths":
      return (
        <ChoicesTextEditor
          label={label}
          list="strengths"
          itemsKey="items"
          tone="strength"
          max={1000}
          ctx={ctx}
          value={value as ChoicesText}
          onChange={set}
          applyTo={{ list: "strengths", label: t("assessment.domain.addToStrengths") }}
        />
      );
    case "fine_motor.support_area_text":
    case "sensory.when_too_much_text":
      return text(1000);
    case "sensory.what_helps_regulate":
      return <HelpsEditor label={label} value={value as HelpsText} ctx={ctx} max={1000} apply onChange={set} />;
    default:
      return null;
  }
}

/** "Strengths seen here" (principle: strengths alongside every area for support). */
export function StrengthsHere({ data, onChange, ctx }: Omit<EditorProps, "domain">) {
  const { t } = useI18n();
  const [open, setOpen] = useState(!!data.strengths_here?.length);
  const label = t("assessment.domain.strengthsHere");
  return (
    <div className="space-y-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
        <ChevronDown className={cn("size-5 text-ink-muted transition-transform", open && "rotate-180")} aria-hidden />
        {label}
      </button>
      {open && (
        <>
          <ChoiceChips list="strengths" tone="strength" label={label} value={data.strengths_here} disabled={ctx.readOnly} onChange={(v) => onChange({ ...data, strengths_here: v })} />
          <ApplyButton ctx={ctx} list="strengths" items={toApply(data.strengths_here)} label={t("assessment.domain.addToStrengths")} />
        </>
      )}
    </div>
  );
}

export function DomainHints({ domain, ctx }: { domain: Domain; ctx: EditorContext }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const hints = domainHints(domain, ctx.parentSections, optionLabel);
  if (!hints.length) return null;
  return (
    <div className="space-y-1.5 rounded-md bg-tray p-3">
      {hints.map((h) => (
        <ParentHint key={h.key} label={t(`assessment.hints.${h.key}`)} values={h.values} />
      ))}
    </div>
  );
}

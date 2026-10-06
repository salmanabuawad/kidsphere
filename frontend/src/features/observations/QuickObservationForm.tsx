import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Plus, Save, X } from "lucide-react";
import { Button, Field, Input, Textarea, ToggleChip } from "@/components/ui";
import { ProvenanceBadge } from "@/components/source";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { useAction } from "@/lib/useAction";
import { cn } from "@/lib/utils";
import type { FocusAreaSummary } from "@/features/children";
import {
  createObservation,
  INTENSITIES,
  isAiDomain,
  newRequestId,
  QUICK_SUPPORT,
  rememberChild,
  STAGE_C_HELPS,
  toLocalInput,
  updateObservation,
  type AiDomain,
  type DidItChange,
  type Intensity,
  type LookFor,
  type Observation,
  type ObservationInput,
  type ObservationUpdate,
  type SupportLevel,
  type WhenDetail,
} from "./api";
import { SupportScale } from "./SupportScale";

const CHANGE_VALUES: DidItChange[] = ["yes", "partly", "no"];
const STEPS = ["a", "b", "c", "d", "e"] as const;
type Step = (typeof STEPS)[number];
const WHEN_TEXT_FIELDS = [
  ["with_whom", "withWhom", 200],
  ["before_event", "before", 200],
  ["after_event", "after", 200],
] as const;

/** Drop empty strings, empty lists and empty objects (the server stores only what was filled in). */
function clean<T extends Record<string, unknown>>(obj: T): Partial<T> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    out[k] = typeof v === "string" ? v.trim() : v;
  }
  return Object.keys(out).length ? (out as Partial<T>) : undefined;
}

/** A saved quick observation as the history returns it (ObservationRow), for edit mode. */
export type EditableObservation = {
  id: string;
  observation: string | null;
  context?: string | null;
  focus_area_id?: string | null;
  support_level?: string | null;
  what_helped?: ({ key?: string | null; custom?: string | null } | string)[] | null;
  domains?: string[] | null;
  attributes?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const keyOf = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { key?: unknown }).key === "string" ? (v as { key: string }).key : null;

/** The form's state from a saved observation (every A–E field, the attributes and the plan link). */
function fromSaved(o: EditableObservation) {
  const d = o.details ?? {};
  const a = o.attributes ?? {};
  const whenRaw = d.when_detail && typeof d.when_detail === "object" ? (d.when_detail as Record<string, unknown>) : {};
  const when: WhenDetail = {};
  for (const k of ["time", "activity", "activity_text", "with_whom", "before_event", "after_event"] as const) if (str(whenRaw[k])) when[k] = str(whenRaw[k]);
  const needsRaw = d.needs && typeof d.needs === "object" ? (d.needs as { helps?: unknown[]; text?: unknown }) : {};
  const helped = o.what_helped ?? [];
  const change = str(d.did_it_change);
  const planRef = d.plan_ref && typeof d.plan_ref === "object" ? (d.plan_ref as { focus_area_id?: unknown }) : {};
  const minutes = a.duration_minutes;
  const level = str(o.support_level);
  return {
    text: o.observation ?? "",
    context: o.context ?? null,
    focusId: o.focus_area_id ?? null,
    support: (QUICK_SUPPORT as string[]).includes(level) ? (level as SupportLevel) : null,
    helps: helped.map(keyOf).filter((k): k is string => !!k),
    customHelps: helped.map((h) => (typeof h === "object" && h && typeof h.custom === "string" ? h.custom : null)).filter((c): c is string => !!c),
    whatISee: str(d.what_i_see),
    domains: (o.domains ?? []).filter(isAiDomain),
    frequency: str(a.frequency) || null,
    duration: typeof minutes === "number" ? String(minutes) : "",
    intensity: (INTENSITIES as readonly string[]).includes(str(a.intensity)) ? (str(a.intensity) as Intensity) : null,
    when,
    needs: (Array.isArray(needsRaw.helps) ? needsRaw.helps : []).map(keyOf).filter((k): k is string => !!k),
    needsText: str(needsRaw.text),
    whatWeDid: str(d.what_we_did),
    planFocus: typeof planRef.focus_area_id === "string" ? planRef.focus_area_id : null,
    didItChange: change === "yes" || change === "partly" || change === "no" ? (change as DidItChange) : null,
    whatChanged: str(d.what_changed),
    documentation: str(d.documentation),
  };
}

/**
 * Quick observation (spec §21, < 30 seconds, phone first). Only "What happened?" is
 * required; context, focus, support and what helped are one tap each. "More details"
 * opens the observation model's Observe → Understand → Act stepper (D14):
 * A what I see (+ areas and how often / long / strongly), B when, C what the child may
 * need, D what we will do (linked to a Current Focus), E did anything change.
 */
export function QuickObservationForm({
  childId,
  focusAreas,
  onSaved,
  lookFor,
  initial,
}: {
  childId: string;
  focusAreas: FocusAreaSummary[];
  onSaved: (o: Observation) => void;
  /** An AI SUGGESTED "what to look for next" question: shown as a reminder; its area is pre-selected. */
  lookFor?: LookFor | null;
  /** Edit mode: a saved quick observation (every A–E field, the attributes and the plan link are
   *  filled in); saving sends PUT /api/observations/{id}, which keeps the earlier version (X-13). */
  initial?: EditableObservation | null;
}) {
  const { t } = useI18n();
  const { list, labelOf, optionLabel } = useOptions();
  const { formatDateTime } = useFormat();
  const { pending, run } = useAction();
  const [requestId] = useState(newRequestId);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const editing = initial ? fromSaved(initial) : null;

  const [context, setContext] = useState<string | null>(editing?.context ?? null);
  const [focusId, setFocusId] = useState<string | null>(editing?.focusId ?? null);
  const [text, setText] = useState(editing?.text ?? "");
  const [textError, setTextError] = useState<string | null>(null);
  const [support, setSupport] = useState<SupportLevel | null>(editing?.support ?? null);
  const [helps, setHelps] = useState<string[]>(editing?.helps ?? []);
  const [customHelps, setCustomHelps] = useState<string[]>(editing?.customHelps ?? []);
  const [customDraft, setCustomDraft] = useState("");
  const lookForDomain = isAiDomain(lookFor?.domain) ? lookFor.domain : null;
  const [moreOpen, setMoreOpen] = useState(lookForDomain !== null || editing !== null);
  const [observedAt, setObservedAt] = useState<string | null>(null);

  // Observe → Understand → Act (D14)
  const [step, setStep] = useState<Step>(editing ? (editing.whatWeDid ? "e" : "d") : "a");
  const [whatISee, setWhatISee] = useState(editing?.whatISee ?? "");
  const [domains, setDomains] = useState<AiDomain[]>(editing?.domains ?? (lookForDomain ? [lookForDomain] : []));
  const [frequency, setFrequency] = useState<string | null>(editing?.frequency ?? null);
  const [duration, setDuration] = useState(editing?.duration ?? "");
  const [intensity, setIntensity] = useState<Intensity | null>(editing?.intensity ?? null);
  const [when, setWhen] = useState<WhenDetail>(editing?.when ?? {});
  const [needs, setNeeds] = useState<string[]>(editing?.needs ?? []);
  const [needsText, setNeedsText] = useState(editing?.needsText ?? "");
  const [whatWeDid, setWhatWeDid] = useState(editing?.whatWeDid ?? "");
  const [planFocus, setPlanFocus] = useState<string | null>(editing?.planFocus ?? null);
  const [didItChange, setDidItChange] = useState<DidItChange | null>(editing?.didItChange ?? null);
  const [whatChanged, setWhatChanged] = useState(editing?.whatChanged ?? "");
  const [documentation, setDocumentation] = useState(editing?.documentation ?? "");

  const contexts = list("observation_contexts");
  const helpOptions = list("what_helps").filter((h) => h.key !== "other");
  const toggle = <T extends string>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const stepIndex = STEPS.indexOf(step);

  function addCustom() {
    const v = customDraft.trim();
    if (!v) return;
    if (!customHelps.includes(v)) setCustomHelps((c) => [...c, v]);
    setCustomDraft("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const observation = text.trim();
    if (!observation) {
      setTextError(t("observations.required"));
      textRef.current?.focus();
      return;
    }
    const focus = focusAreas.find((f) => f.id === focusId);
    const pendingCustom = customDraft.trim();
    const custom = pendingCustom && !customHelps.includes(pendingCustom) ? [...customHelps, pendingCustom] : customHelps;
    const minutes = Number.parseInt(duration, 10);
    const attributes = clean({
      frequency: frequency ?? undefined,
      duration_minutes: Number.isFinite(minutes) && minutes >= 1 && minutes <= 90 ? minutes : undefined,
      intensity: intensity ?? undefined,
    });
    const details = clean({
      what_i_see: whatISee,
      when_detail: clean(when),
      needs: clean({ helps: needs, text: needsText }),
      what_we_did: whatWeDid,
      plan_ref: planFocus ? { focus_area_id: planFocus } : undefined,
      did_it_change: didItChange ?? undefined,
      what_changed: didItChange === "yes" || didItChange === "partly" ? whatChanged : undefined,
      documentation,
    });
    if (initial) {
      // Every field is sent, so clearing one in the form clears it on the server too.
      const update: ObservationUpdate = {
        observation,
        context,
        focus_area_id: focusId,
        support_level: support,
        what_helped: [...helps, ...custom.map((c) => ({ custom: c }))],
        domains,
        attributes: attributes ?? null,
        details: details ?? null,
        ...(observedAt ? { observed_at: new Date(observedAt).toISOString() } : {}),
      };
      const r = await run(() => updateObservation(initial.id, update), { success: t("observations.updated") });
      if (r.ok) onSaved(r.data.observation);
      return;
    }
    const body: ObservationInput = {
      observation,
      client_request_id: requestId,
      ...(context ? { context } : {}),
      ...(focus ? { focus_area_id: focus.id, area: focus.category } : {}),
      ...(support ? { support_level: support } : {}),
      ...(helps.length || custom.length ? { what_helped: [...helps, ...custom.map((c) => ({ custom: c }))] } : {}),
      ...(domains.length ? { domains } : {}),
      ...(attributes ? { attributes } : {}),
      ...(details ? { details } : {}),
      ...(observedAt ? { observed_at: new Date(observedAt).toISOString() } : {}),
    };
    const r = await run(() => createObservation(childId, body), { success: t("observations.saved") });
    if (r.ok) {
      rememberChild(childId);
      onSaved(r.data.observation);
    }
  }

  const setWhenField = (k: keyof WhenDetail, v: string) => setWhen((w) => ({ ...w, [k]: v }));

  const stages: Record<Step, ReactNode> = {
    a: (
      <div className="space-y-5">
        <Field label={t("observations.stepper.steps.a")} hint={t("observations.stepper.aHelper")}>
          {(p) => <Textarea {...p} rows={3} maxLength={2000} value={whatISee} onChange={(e) => setWhatISee(e.target.value)} />}
        </Field>
        <ChipGroup label={t("observations.stepper.domains")}>
          {list("ai_domains").map((d) => (
            <ToggleChip key={d.key} icon={d.icon} selected={domains.includes(d.key as AiDomain)} onToggle={() => setDomains((s) => toggle(s, d.key as AiDomain))}>
              {labelOf(d)}
            </ToggleChip>
          ))}
        </ChipGroup>
        <ChipGroup label={t("observations.stepper.frequency")} single>
          {list("observation_frequency").map((f) => (
            <ToggleChip key={f.key} single selected={frequency === f.key} onToggle={() => setFrequency(frequency === f.key ? null : f.key)}>
              {labelOf(f)}
            </ToggleChip>
          ))}
        </ChipGroup>
        <Field label={t("observations.stepper.duration")} className="max-w-48">
          {(p) => (
            <Input {...p} type="number" inputMode="numeric" dir="ltr" min={1} max={90} value={duration} onChange={(e) => setDuration(e.target.value)} />
          )}
        </Field>
        <ChipGroup label={t("observations.stepper.intensity")} single>
          {INTENSITIES.map((k) => (
            <ToggleChip key={k} single selected={intensity === k} onToggle={() => setIntensity(intensity === k ? null : k)}>
              {t(`observations.stepper.intensities.${k}`)}
            </ToggleChip>
          ))}
        </ChipGroup>
      </div>
    ),
    b: (
      <div className="space-y-5">
        <Field label={t("observations.stepper.time")} className="max-w-60">
          {(p) => <Input {...p} dir="auto" maxLength={60} value={when.time ?? ""} onChange={(e) => setWhenField("time", e.target.value)} />}
        </Field>
        <ChipGroup label={t("observations.stepper.activity")} single>
          {contexts.map((c) => {
            const on = (when.activity ?? context) === c.key;
            return (
              <ToggleChip key={c.key} single icon={c.icon} selected={on} onToggle={() => setWhenField("activity", on ? "" : c.key)}>
                {labelOf(c)}
              </ToggleChip>
            );
          })}
        </ChipGroup>
        <Field label={t("observations.stepper.activityText")}>
          {(p) => <Input {...p} dir="auto" maxLength={200} value={when.activity_text ?? ""} onChange={(e) => setWhenField("activity_text", e.target.value)} />}
        </Field>
        {WHEN_TEXT_FIELDS.map(([k, label, max]) => (
          <Field key={k} label={t(`observations.stepper.${label}`)}>
            {(p) => <Input {...p} dir="auto" maxLength={max} value={when[k] ?? ""} onChange={(e) => setWhenField(k, e.target.value)} />}
          </Field>
        ))}
      </div>
    ),
    c: (
      <div className="space-y-5">
        <ChipGroup label={t("observations.stepper.steps.c")}>
          {STAGE_C_HELPS.map((k) => (
            <ToggleChip key={k} tone="helps" selected={needs.includes(k)} onToggle={() => setNeeds((s) => toggle(s, k))}>
              {optionLabel("what_helps", k)}
            </ToggleChip>
          ))}
        </ChipGroup>
        <Field label={t("observations.stepper.needsOther")}>
          {(p) => <Textarea {...p} rows={2} maxLength={500} value={needsText} onChange={(e) => setNeedsText(e.target.value)} />}
        </Field>
      </div>
    ),
    d: (
      <div className="space-y-5">
        <Field label={t("observations.stepper.steps.d")} hint={t("observations.stepper.dHelper")}>
          {(p) => <Textarea {...p} rows={3} maxLength={2000} value={whatWeDid} onChange={(e) => setWhatWeDid(e.target.value)} />}
        </Field>
        {focusAreas.length > 0 && (
          <ChipGroup label={t("observations.stepper.linkFocus")} single>
            {focusAreas.map((f) => (
              <ToggleChip key={f.id} single tone="focus" selected={planFocus === f.id} onToggle={() => setPlanFocus(planFocus === f.id ? null : f.id)}>
                {f.title}
              </ToggleChip>
            ))}
          </ChipGroup>
        )}
      </div>
    ),
    e: (
      <div className="space-y-5">
        <ChipGroup label={t("observations.stepper.steps.e")} single>
          {CHANGE_VALUES.map((v) => (
            <ToggleChip key={v} single selected={didItChange === v} onToggle={() => setDidItChange(didItChange === v ? null : v)}>
              {t(`observations.model.${v}`)}
            </ToggleChip>
          ))}
        </ChipGroup>
        {(didItChange === "yes" || didItChange === "partly") && (
          <Field label={t("observations.stepper.whatChanged")}>
            {(p) => <Textarea {...p} rows={2} maxLength={1000} value={whatChanged} onChange={(e) => setWhatChanged(e.target.value)} />}
          </Field>
        )}
        <Field label={t("observations.stepper.documentation")}>
          {(p) => <Textarea {...p} rows={3} maxLength={2000} value={documentation} onChange={(e) => setDocumentation(e.target.value)} />}
        </Field>
      </div>
    ),
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6" aria-label={t("observations.title")}>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-base font-semibold text-ink">{t("observations.context")}</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {contexts.map((c) => {
            const on = context === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => setContext(on ? null : c.key)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border-2 px-2 py-2 text-center text-sm transition-colors",
                  on ? "border-brand bg-surface font-semibold text-ink shadow-lip" : "border-line-strong bg-surface font-medium text-ink hover:bg-tray",
                )}
              >
                {c.icon && (
                  <span aria-hidden className="text-2xl leading-none">
                    {c.icon}
                  </span>
                )}
                <span className="leading-tight">{labelOf(c)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {focusAreas.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-base font-semibold text-ink">{t("observations.focus")}</legend>
          <div className="flex flex-wrap gap-2">
            {focusAreas.map((f) => (
              <ToggleChip key={f.id} tone="attention" selected={focusId === f.id} onToggle={() => setFocusId(focusId === f.id ? null : f.id)}>
                {f.title}
              </ToggleChip>
            ))}
          </div>
        </fieldset>
      )}

      {lookFor?.question && (
        <div className="space-y-2 rounded-md border border-line bg-tray p-3" data-look-for>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{t("observations.lookFor")}</p>
            <ProvenanceBadge kind="ai_suggested" />
          </div>
          <p className="text-base text-ink" dir="auto">
            {lookFor.question}
          </p>
        </div>
      )}

      <Field label={<span className="text-base font-semibold">{t("observations.what")}</span>} error={textError} required hint={t("observations.tip")}>
        {(p) => (
          <Textarea
            {...p}
            ref={textRef}
            dir="auto"
            rows={4}
            maxLength={4000}
            className="text-base"
            placeholder={t("observations.whatPlaceholder")}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (textError && e.target.value.trim()) setTextError(null);
            }}
          />
        )}
      </Field>

      <fieldset>
        <legend className="mb-2 text-base font-semibold text-ink">{t("observations.support")}</legend>
        <SupportScale
          size="lg"
          label={t("observations.support")}
          options={QUICK_SUPPORT.map((level) => ({ key: level, label: t(`observations.supportLevels.${level}`) }))}
          value={support}
          onChange={(v) => setSupport(v as SupportLevel | null)}
        />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-base font-semibold text-ink">{t("observations.helped")}</legend>
        <div className="flex flex-wrap gap-2">
          {helpOptions.map((h) => (
            <ToggleChip key={h.key} tone="helps" icon={h.icon} selected={helps.includes(h.key)} onToggle={() => setHelps((s) => toggle(s, h.key))}>
              {labelOf(h)}
            </ToggleChip>
          ))}
          {customHelps.map((c) => (
            <span key={c} className="inline-flex min-h-11 items-center gap-1 rounded-sm border-2 border-helps-ink bg-helps-soft ps-3.5 pe-1 text-sm font-semibold text-ink">
              <span dir="auto">{c}</span>
              <button
                type="button"
                aria-label={t("observations.remove", { label: c })}
                onClick={() => setCustomHelps((s) => s.filter((x) => x !== c))}
                className="flex size-9 items-center justify-center rounded-sm hover:bg-tray"
              >
                <X className="size-4" aria-hidden />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            dir="auto"
            maxLength={200}
            aria-label={t("observations.helpedOther")}
            placeholder={t("observations.helpedOther")}
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button variant="outline" icon={<Plus className="size-4" aria-hidden />} onClick={addCustom} disabled={!customDraft.trim()}>
            {t("observations.add")}
          </Button>
        </div>
      </fieldset>

      <div className="rounded-lg border border-line bg-surface">
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
          className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-start text-sm font-semibold text-ink"
        >
          {t("observations.more")}
          <ChevronDown className={cn("size-5 text-ink-muted transition-transform", moreOpen && "rotate-180")} aria-hidden />
        </button>
        {moreOpen && (
          <div className="space-y-5 border-t border-line p-4">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <Clock className="size-4 text-ink-muted" aria-hidden />
                {t("observations.time")}:{" "}
                <span className="font-normal">{observedAt ? formatDateTime(new Date(observedAt)) : t("observations.now")}</span>
              </p>
              {observedAt === null ? (
                <Button size="sm" variant="ghost" onClick={() => setObservedAt(toLocalInput(new Date()))}>
                  {t("observations.changeTime")}
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="datetime-local"
                    dir="ltr"
                    className="w-auto"
                    aria-label={t("observations.time")}
                    max={toLocalInput(new Date())}
                    value={observedAt}
                    onChange={(e) => setObservedAt(e.target.value || null)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setObservedAt(null)}>
                    {t("observations.useNow")}
                  </Button>
                </div>
              )}
            </div>

            <section aria-labelledby="qo-stepper-title" className="space-y-4">
              <div>
                <h2 id="qo-stepper-title" className="text-sm font-semibold text-ink">
                  {t("observations.stepper.title")}
                </h2>
                <p className="text-caption text-ink-muted">{t("observations.stepper.sequence")}</p>
              </div>
              <ol className="grid grid-cols-5 gap-1 rounded-md bg-tray p-1">
                {STEPS.map((s) => {
                  const on = s === step;
                  const letter = t(`observations.stepper.letters.${s}`);
                  return (
                    <li key={s}>
                      <button
                        type="button"
                        aria-current={on ? "step" : undefined}
                        onClick={() => setStep(s)}
                        className={cn(
                          "flex min-h-11 w-full items-center justify-center rounded-md border-2 text-sm",
                          on ? "border-brand bg-surface font-semibold text-ink shadow-lip" : "border-transparent font-medium text-ink-muted hover:text-ink",
                        )}
                      >
                        <span aria-hidden>{letter}</span>
                        <span className="sr-only">{t("observations.stepper.stepOf", { letter, name: t(`observations.stepper.steps.${s}`) })}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <h3 className="font-display text-title font-semibold text-ink">
                {t(`observations.stepper.letters.${step}`)}. {t(`observations.stepper.steps.${step}`)}
              </h3>
              {stages[step]}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  icon={<ChevronLeft className="rtl:-scale-x-100" aria-hidden />}
                  disabled={stepIndex === 0}
                  onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)]!)}
                >
                  {t("observations.stepper.back")}
                </Button>
                <Button
                  variant="secondary"
                  disabled={stepIndex === STEPS.length - 1}
                  onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)]!)}
                >
                  {t("observations.stepper.next")}
                  <ChevronRight className="rtl:-scale-x-100" aria-hidden />
                </Button>
              </div>
            </section>
          </div>
        )}
      </div>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-1 rounded-lg bg-ground/90 p-1 backdrop-blur lg:bottom-4">
        <Button type="submit" size="xl" className="w-full" loading={pending} icon={<Save className="size-6" aria-hidden />}>
          {initial ? t("observations.saveChanges") : t("observations.save")}
        </Button>
      </div>
    </form>
  );
}

function ChipGroup({ label, single, children }: { label: string; single?: boolean; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2" {...(single ? { role: "radiogroup", "aria-label": label } : {})}>
        {children}
      </div>
    </fieldset>
  );
}

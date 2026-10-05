import { useRef, useState, type FormEvent } from "react";
import { ChevronDown, Clock, Plus, Save, X } from "lucide-react";
import { Button, Field, Input, Textarea, ToggleChip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { useAction } from "@/lib/useAction";
import { cn } from "@/lib/utils";
import type { FocusAreaSummary } from "@/features/children";
import {
  createObservation,
  DETAIL_TEXT_FIELDS,
  newRequestId,
  QUICK_SUPPORT,
  rememberChild,
  toLocalInput,
  type DidItChange,
  type Observation,
  type ObservationDetails,
  type ObservationInput,
  type SupportLevel,
} from "./api";

const SUPPORT_STYLE: Record<string, { on: string; emoji: string }> = {
  independent: { on: "border-emerald-600 bg-emerald-600 text-white", emoji: "🌟" },
  some_support: { on: "border-sky-600 bg-sky-600 text-white", emoji: "🤝" },
  significant_support: { on: "border-amber-600 bg-amber-600 text-white", emoji: "🧗" },
};

const CHANGE_VALUES: DidItChange[] = ["yes", "partly", "no"];

/**
 * Quick observation (spec §21, < 30 seconds, phone first). Only "What
 * happened?" is required; context, focus, support and what helped are one tap
 * each, and the rest sits under "More details".
 */
export function QuickObservationForm({
  childId,
  focusAreas,
  onSaved,
}: {
  childId: string;
  focusAreas: FocusAreaSummary[];
  onSaved: (o: Observation) => void;
}) {
  const { t } = useI18n();
  const { list, labelOf } = useOptions();
  const { formatDateTime } = useFormat();
  const { pending, run } = useAction();
  const [requestId] = useState(newRequestId);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const [context, setContext] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
  const [support, setSupport] = useState<SupportLevel | null>(null);
  const [helps, setHelps] = useState<string[]>([]);
  const [customHelps, setCustomHelps] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [note, setNote] = useState("");
  const [observedAt, setObservedAt] = useState<string | null>(null);
  const [details, setDetails] = useState<ObservationDetails>({});

  const contexts = list("observation_contexts");
  const helpOptions = list("what_helps").filter((h) => h.key !== "other");
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

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
    const cleanDetails = Object.fromEntries(
      Object.entries(details).filter(([, v]) => typeof v === "string" && v.trim()),
    ) as ObservationDetails;
    const pendingCustom = customDraft.trim();
    const custom = pendingCustom && !customHelps.includes(pendingCustom) ? [...customHelps, pendingCustom] : customHelps;
    const body: ObservationInput = {
      observation,
      client_request_id: requestId,
      ...(context ? { context } : {}),
      ...(focus ? { focus_area_id: focus.id, area: focus.category } : {}),
      ...(support ? { support_level: support } : {}),
      ...(helps.length || custom.length ? { what_helped: [...helps, ...custom.map((c) => ({ custom: c }))] } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(Object.keys(cleanDetails).length ? { details: cleanDetails } : {}),
      ...(observedAt ? { observed_at: new Date(observedAt).toISOString() } : {}),
    };
    const r = await run(() => createObservation(childId, body), { success: t("observations.saved") });
    if (r.ok) {
      rememberChild(childId);
      onSaved(r.data.observation);
    }
  }

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
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center text-sm font-medium transition-colors",
                  on ? "border-brand bg-brand text-brand-ink shadow-sm" : "border-line bg-white text-ink hover:bg-stone-50",
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

      <Field label={<span className="text-base font-semibold">{t("observations.what")}</span>} error={textError} required>
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
        <div className="grid grid-cols-3 gap-2">
          {QUICK_SUPPORT.map((level) => {
            const on = support === level;
            const style = SUPPORT_STYLE[level]!;
            return (
              <button
                key={level}
                type="button"
                aria-pressed={on}
                onClick={() => setSupport(on ? null : level)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-center text-sm font-semibold transition-colors sm:text-base",
                  on ? style.on : "border-line bg-white text-ink hover:bg-stone-50",
                )}
              >
                <span aria-hidden className="text-xl leading-none">
                  {style.emoji}
                </span>
                {t(`observations.supportLevels.${level}`)}
              </button>
            );
          })}
        </div>
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
            <span key={c} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-violet-600 bg-violet-600 ps-4 pe-1 text-sm font-medium text-white">
              <span dir="auto">{c}</span>
              <button
                type="button"
                aria-label={t("observations.remove", { label: c })}
                onClick={() => setCustomHelps((s) => s.filter((x) => x !== c))}
                className="flex size-9 items-center justify-center rounded-full hover:bg-white/20"
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

      <div className="rounded-2xl border border-line bg-white">
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
          className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-start text-sm font-semibold text-ink"
        >
          {t("observations.more")}
          <ChevronDown className={cn("size-5 text-muted transition-transform", moreOpen && "rotate-180")} aria-hidden />
        </button>
        {moreOpen && (
          <div className="space-y-5 border-t border-line p-4">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <Clock className="size-4 text-muted" aria-hidden />
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

            <Field label={t("observations.note")}>
              {(p) => <Textarea {...p} dir="auto" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>

            <div className="space-y-4">
              <p className="text-sm font-semibold text-ink">{t("observations.model.title")}</p>
              {DETAIL_TEXT_FIELDS.map((k, i) => (
                <Field key={k} label={`${i + 1}. ${t(`observations.model.${k}`)}`}>
                  {(p) => (
                    <Textarea {...p} dir="auto" rows={2} maxLength={2000} value={details[k] ?? ""} onChange={(e) => setDetails((d) => ({ ...d, [k]: e.target.value }))} />
                  )}
                </Field>
              ))}
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">{`5. ${t("observations.model.did_it_change")}`}</legend>
                <div className="flex flex-wrap gap-2">
                  {CHANGE_VALUES.map((v) => (
                    <ToggleChip
                      key={v}
                      selected={details.did_it_change === v}
                      onToggle={() => setDetails((d) => ({ ...d, did_it_change: d.did_it_change === v ? undefined : v }))}
                    >
                      {t(`observations.model.${v}`)}
                    </ToggleChip>
                  ))}
                </div>
              </fieldset>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-1 rounded-2xl bg-surface/90 p-1 backdrop-blur lg:bottom-4">
        <Button type="submit" size="xl" className="w-full" loading={pending} icon={<Save className="size-6" aria-hidden />}>
          {t("observations.save")}
        </Button>
      </div>
    </form>
  );
}

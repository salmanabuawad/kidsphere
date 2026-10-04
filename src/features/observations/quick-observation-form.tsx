"use client";

import type { DevelopmentDomain, ObservationContext, SupportOutcome } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip, Field, Input, Textarea } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { INTERESTS, STRENGTHS, SUPPORTS, TRIGGERS } from "@/features/child-understanding/vocabulary";
import { CONTEXTS, DOMAINS, QUICK_SUPPORTS, SUPPORT_OUTCOMES } from "./definition";
import { ChipGroup, DictateButton, newRequestId, PatternPicker, type Pattern } from "./shared";

/**
 * Quick Observation — designed for 30–60 seconds on a tablet:
 * context → areas → what you saw → support → did it help → save.
 * Everything else is tucked under "More details".
 */
export function QuickObservationForm({ childId, childName }: { childId: string; childName: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { pending, run } = useAction();
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const requestId = useRef(newRequestId());
  const [context, setContext] = useState<ObservationContext | null>(null);
  const [domains, setDomains] = useState<DevelopmentDomain[]>([]);
  const [behavior, setBehavior] = useState("");
  const [supports, setSupports] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<SupportOutcome>("not_assessed");
  const [more, setMore] = useState(false);
  const [frequency, setFrequency] = useState("");
  const [before, setBefore] = useState("");
  const [beforeTags, setBeforeTags] = useState<string[]>([]);
  const [customSupport, setCustomSupport] = useState("");
  const [strength, setStrength] = useState("");
  const [strengthTags, setStrengthTags] = useState<string[]>([]);
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [patterns, setPatterns] = useState<Pattern[]>([]);

  const canSave = !!context && domains.length > 0 && behavior.trim().length >= 2;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const ok = await run(
      () =>
        api(`/api/children/${childId}/observations`, {
          body: {
            kind: "QUICK",
            context,
            domains,
            observedBehavior: behavior,
            frequencyOrDuration: frequency || null,
            whatHappenedBefore: before || null,
            antecedentTags: beforeTags,
            supportsTried: supports,
            customSupport: customSupport || null,
            outcome,
            strengthNoticed: strength || null,
            strengthTags,
            interestTags,
            teacherNote: note || null,
            possiblePatterns: patterns,
            entrySeconds: Math.round((Date.now() - started.current) / 1000),
            clientRequestId: requestId.current,
          },
        }),
      { success: t("teacher.observations.savedObservation"), refresh: false },
    );
    if (ok) {
      router.push(`/teacher/children/${childId}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" data-testid="quick-observation-form">
      <Card className="space-y-5 p-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("teacher.observations.context")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CONTEXTS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={context === c.key}
                onClick={() => setContext(c.key)}
                data-testid={`ctx-${c.key}`}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-sm transition-colors",
                  context === c.key ? "border-brand bg-brand text-brand-ink" : "border-line bg-white hover:bg-stone-50",
                )}
              >
                <span className="text-xl" aria-hidden>
                  {c.emoji}
                </span>
                {c.label[locale]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("teacher.observations.domains")}</legend>
          <div className="flex flex-wrap gap-2">
            {DOMAINS.map((d) => (
              <Chip
                key={d.key}
                selected={domains.includes(d.key)}
                onClick={() => setDomains(domains.includes(d.key) ? domains.filter((x) => x !== d.key) : [...domains, d.key])}
              >
                <span aria-hidden>{d.emoji}</span>
                {d.label[locale]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="behavior" className="text-sm font-medium">
              {t("teacher.observations.behavior")} <span className="text-rose-600">*</span>
            </label>
            <DictateButton onText={(text) => setBehavior((b) => (b ? `${b} ${text}` : text))} />
          </div>
          <Textarea
            id="behavior"
            rows={3}
            value={behavior}
            onChange={(e) => setBehavior(e.target.value)}
            placeholder={t("teacher.observations.behaviorPlaceholder").replace("{name}", childName)}
            aria-describedby="behavior-hint"
            data-testid="obs-behavior"
          />
          <p id="behavior-hint" className="text-muted mt-1 text-xs">
            {t("teacher.observations.behaviorHint")}
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("teacher.observations.supports")}</legend>
          <ChipGroup entries={SUPPORTS.filter((s) => (QUICK_SUPPORTS as readonly string[]).includes(s.key))} value={supports} onChange={setSupports} />
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("teacher.observations.outcome")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SUPPORT_OUTCOMES.map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={outcome === o.key}
                onClick={() => setOutcome(o.key)}
                data-testid={`outcome-${o.key}`}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm",
                  outcome === o.key ? "border-brand bg-brand/10 text-brand font-medium" : "border-line bg-white hover:bg-stone-50",
                )}
              >
                {o.label[locale]}
              </button>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="p-0">
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium"
        >
          {t("teacher.observations.moreDetails")}
          <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
        </button>
        {more && (
          <div className="border-line space-y-5 border-t px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("teacher.observations.frequency")}>
                {(p) => <Input {...p} value={frequency} onChange={(e) => setFrequency(e.target.value)} />}
              </Field>
              <Field label={t("teacher.observations.customSupport")}>
                {(p) => <Input {...p} value={customSupport} onChange={(e) => setCustomSupport(e.target.value)} />}
              </Field>
            </div>
            <Field label={t("teacher.observations.beforeLabel")}>
              {(p) => <Textarea {...p} rows={2} value={before} onChange={(e) => setBefore(e.target.value)} />}
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium">{t("teacher.observations.beforeTags")}</p>
              <ChipGroup entries={TRIGGERS} value={beforeTags} onChange={setBeforeTags} max={5} />
            </div>
            <Field label={t("teacher.observations.strengthLabel")}>
              {(p) => <Input {...p} value={strength} onChange={(e) => setStrength(e.target.value)} />}
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium">{t("teacher.observations.strengthTags")}</p>
              <ChipGroup entries={STRENGTHS} value={strengthTags} onChange={setStrengthTags} max={5} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t("teacher.observations.interestTags")}</p>
              <ChipGroup entries={INTERESTS} value={interestTags} onChange={setInterestTags} max={5} />
            </div>
            <Field label={t("teacher.observations.noteLabel")}>
              {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
            <div>
              <p className="text-sm font-medium">{t("teacher.observations.pattern")}</p>
              <p className="text-muted mb-2 text-xs">{t("teacher.observations.patternHint")}</p>
              <PatternPicker value={patterns} onChange={setPatterns} />
            </div>
          </div>
        )}
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button type="submit" size="lg" disabled={!canSave} loading={pending} className="shadow-lg" data-testid="save-observation">
          {t("teacher.observations.saveObservation")}
        </Button>
      </div>
    </form>
  );
}

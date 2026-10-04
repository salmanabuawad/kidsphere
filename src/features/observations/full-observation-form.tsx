"use client";

import type { ObservationContext, ObservationRating, SupportOutcome } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { INTERESTS, STRENGTHS, SUPPORTS } from "@/features/child-understanding/vocabulary";
import { DOMAINS, DOMAIN_ITEMS, PARTICIPATION_CONTEXTS, PARTICIPATION_FIELDS, RATINGS, SUPPORT_OUTCOMES } from "./definition";
import { ChipGroup, newRequestId, PatternPicker, type Pattern } from "./shared";

type ItemKey = `${keyof typeof DOMAIN_ITEMS}.${string}`;
type ParticipationField = (typeof PARTICIPATION_FIELDS)[number]["key"];

export function FullObservationForm({ childId }: { childId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { pending, run } = useAction();
  const requestId = useRef(newRequestId());
  const [ratings, setRatings] = useState<Record<ItemKey, ObservationRating>>({} as Record<ItemKey, ObservationRating>);
  const [summary, setSummary] = useState("");
  const [overwhelmed, setOverwhelmed] = useState("");
  const [regulation, setRegulation] = useState("");
  const [participation, setParticipation] = useState<Partial<Record<ObservationContext, Partial<Record<ParticipationField, string>>>>>({});
  const [supports, setSupports] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<SupportOutcome>("not_assessed");
  const [strengthTags, setStrengthTags] = useState<string[]>([]);
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [strength, setStrength] = useState("");
  const [note, setNote] = useState("");
  const [patterns, setPatterns] = useState<Pattern[]>([]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const items = Object.entries(ratings)
      .filter(([, r]) => r !== "NOT_OBSERVED")
      .map(([k, rating]) => {
        const [domain, itemKey] = k.split(".") as [string, string];
        return { domain, itemKey, rating, note: null };
      });
    const cleanParticipation = Object.fromEntries(
      Object.entries(participation)
        .map(([ctx, v]) => [ctx, Object.fromEntries(Object.entries(v ?? {}).filter(([, s]) => s && s.trim()))])
        .filter(([, v]) => Object.keys(v as object).length > 0),
    );
    const ok = await run(
      () =>
        api(`/api/children/${childId}/observations`, {
          body: {
            kind: "FULL",
            context: "other",
            observedBehavior: summary,
            items,
            sensory: overwhelmed || regulation ? { overwhelmed: overwhelmed || null, regulation: regulation || null } : undefined,
            participation: Object.keys(cleanParticipation).length ? cleanParticipation : undefined,
            supportsTried: supports,
            outcome,
            strengthTags,
            interestTags,
            strengthNoticed: strength || null,
            teacherNote: note || null,
            possiblePatterns: patterns,
            clientRequestId: requestId.current,
          },
        }),
      { success: t("teacher.observations.savedObservation"), refresh: false },
    );
    if (ok) {
      router.push(`/teacher/children/${childId}/observations`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Alert tone="info">{t("teacher.observations.ratingHelp")}</Alert>

      {DOMAINS.filter((d) => d.key !== "PARTICIPATION").map((d) => {
        const items = DOMAIN_ITEMS[d.key as keyof typeof DOMAIN_ITEMS];
        const rated = items.filter((i) => (ratings[`${d.key}.${i.key}` as ItemKey] ?? "NOT_OBSERVED") !== "NOT_OBSERVED").length;
        return (
          <details key={d.key} className="group border-line bg-card rounded-2xl border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
              <span className="flex items-center gap-2 font-medium">
                <span aria-hidden>{d.emoji}</span>
                {d.label[locale]}
              </span>
              <span className="text-muted text-xs">{rated > 0 ? `${rated}/${items.length}` : ""}</span>
            </summary>
            <div className="divide-line border-line divide-y border-t px-5">
              {items.map((item) => {
                const key = `${d.key}.${item.key}` as ItemKey;
                const value = ratings[key] ?? "NOT_OBSERVED";
                return (
                  <div key={item.key} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                    <span className="text-sm">{item.label[locale]}</span>
                    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={item.label[locale]}>
                      {RATINGS.map((r) => (
                        <button
                          key={r.key}
                          type="button"
                          role="radio"
                          aria-checked={value === r.key}
                          onClick={() => setRatings({ ...ratings, [key]: r.key })}
                          className={cn(
                            "rounded-lg border px-2.5 py-1 text-xs",
                            value === r.key ? "border-brand bg-brand/10 text-brand font-medium" : "border-line text-stone-600 hover:bg-stone-50",
                          )}
                        >
                          {r.label[locale]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {d.key === "SENSORY" && (
                <div className="grid gap-4 py-4 md:grid-cols-2">
                  <Field label={t("teacher.observations.overwhelmed")}>
                    {(p) => <Textarea {...p} value={overwhelmed} onChange={(e) => setOverwhelmed(e.target.value)} />}
                  </Field>
                  <Field label={t("teacher.observations.regulation")}>
                    {(p) => <Textarea {...p} value={regulation} onChange={(e) => setRegulation(e.target.value)} />}
                  </Field>
                </div>
              )}
            </div>
          </details>
        );
      })}

      <details className="border-line bg-card rounded-2xl border">
        <summary className="cursor-pointer list-none px-5 py-4 font-medium">🌞 {t("teacher.observations.participation")}</summary>
        <div className="border-line space-y-4 border-t p-5">
          {PARTICIPATION_CONTEXTS.map((c) => (
            <div key={c.key}>
              <p className="mb-2 text-sm font-medium">
                {c.emoji} {c.label[locale]}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {PARTICIPATION_FIELDS.map((f) => (
                  <Textarea
                    key={f.key}
                    rows={1}
                    placeholder={f.label[locale]}
                    aria-label={`${c.label[locale]} — ${f.label[locale]}`}
                    value={participation[c.key]?.[f.key] ?? ""}
                    onChange={(e) => setParticipation({ ...participation, [c.key]: { ...participation[c.key], [f.key]: e.target.value } })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>

      <Card className="space-y-5 p-5">
        <Field label={t("teacher.observations.summary")} required hint={t("teacher.observations.behaviorHint")}>
          {(p) => <Textarea {...p} rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />}
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium">{t("teacher.observations.supports")}</p>
          <ChipGroup entries={SUPPORTS} value={supports} onChange={setSupports} />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">{t("teacher.observations.outcome")}</p>
          <div className="flex flex-wrap gap-2">
            {SUPPORT_OUTCOMES.map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={outcome === o.key}
                onClick={() => setOutcome(o.key)}
                className={cn("rounded-xl border px-3 py-2 text-sm", outcome === o.key ? "border-brand bg-brand/10 text-brand" : "border-line")}
              >
                {o.label[locale]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">{t("teacher.observations.strengthTags")}</p>
          <ChipGroup entries={STRENGTHS} value={strengthTags} onChange={setStrengthTags} max={8} />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">{t("teacher.observations.interestTags")}</p>
          <ChipGroup entries={INTERESTS} value={interestTags} onChange={setInterestTags} max={8} />
        </div>
        <Field label={t("teacher.observations.strengthLabel")}>
          {(p) => <Textarea {...p} rows={2} value={strength} onChange={(e) => setStrength(e.target.value)} />}
        </Field>
        <Field label={t("teacher.observations.noteLabel")}>{(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <div>
          <p className="text-sm font-medium">{t("teacher.observations.pattern")}</p>
          <p className="text-muted mb-2 text-xs">{t("teacher.observations.patternHint")}</p>
          <PatternPicker value={patterns} onChange={setPatterns} max={5} />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={summary.trim().length < 2} loading={pending}>
          {t("teacher.observations.saveObservation")}
        </Button>
      </div>
    </form>
  );
}

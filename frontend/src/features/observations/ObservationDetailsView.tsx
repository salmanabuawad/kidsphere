import type { ReactNode } from "react";
import { Chip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import type { HelpItem, Observation } from "./api";

/**
 * Read-only Observe → Understand → Act view of one observation (stages A–E, the areas
 * it touches and how often / long / strongly). For the observation detail page and the
 * history lists. Older free-text stages (`when`, `what_needed`) show as they were written.
 */
export function ObservationDetailsView({ observation, className }: { observation: Observation; className?: string }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const d = observation.details ?? {};
  const a = observation.attributes ?? {};
  const helps = (items?: HelpItem[] | null) => (items ?? []).map((h) => (h.key ? optionLabel("what_helps", h.key) : h.custom!));
  const when = d.when_detail ?? {};
  const whenParts = [
    when.time,
    when.activity ? optionLabel("observation_contexts", when.activity) : null,
    when.activity_text,
    when.with_whom && `${t("observations.stepper.withWhom")} ${when.with_whom}`,
    when.before_event && `${t("observations.stepper.before")} ${when.before_event}`,
    when.after_event && `${t("observations.stepper.after")} ${when.after_event}`,
  ].filter(Boolean) as string[];
  const rows: [string, ReactNode][] = [];
  const add = (label: string, value: ReactNode) => {
    if (value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0)) rows.push([label, value]);
  };
  const domains = observation.domains ?? [];
  add(t("observations.view.areas"), domains.length ? <Chips items={domains.map((k) => optionLabel("ai_domains", k))} /> : null);
  add(t("observations.stepper.frequency"), a.frequency ? optionLabel("observation_frequency", a.frequency) : null);
  add(t("observations.stepper.duration"), a.duration_minutes ? t("common.minutes", { count: a.duration_minutes }) : null);
  add(t("observations.stepper.intensity"), a.intensity ? t(`observations.stepper.intensities.${a.intensity}`) : null);
  add(`${t("observations.stepper.letters.a")}. ${t("observations.stepper.steps.a")}`, d.what_i_see);
  add(`${t("observations.stepper.letters.b")}. ${t("observations.stepper.steps.b")}`, whenParts.length ? whenParts.join(" · ") : d.when);
  const needs = helps(d.needs?.helps);
  add(
    `${t("observations.stepper.letters.c")}. ${t("observations.stepper.steps.c")}`,
    needs.length || d.needs?.text ? (
      <>
        {needs.length > 0 && <Chips items={needs} />}
        {d.needs?.text && <p dir="auto">{d.needs.text}</p>}
      </>
    ) : (
      d.what_needed
    ),
  );
  add(`${t("observations.stepper.letters.d")}. ${t("observations.stepper.steps.d")}`, d.what_we_did);
  add(`${t("observations.stepper.letters.e")}. ${t("observations.stepper.steps.e")}`, d.did_it_change ? t(`observations.model.${d.did_it_change}`) : null);
  add(t("observations.stepper.whatChanged"), d.what_changed);
  add(t("observations.stepper.documentation"), d.documentation);
  if (!rows.length) return null;
  return (
    <dl className={className ?? "space-y-3"}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-caption font-medium text-ink-muted">{label}</dt>
          <dd className="text-base text-ink" dir="auto">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Chip key={i}>{i}</Chip>
      ))}
    </span>
  );
}

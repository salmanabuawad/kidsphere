import { useId, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { SlidersHorizontal, X } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { pick } from "@/i18n/config";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { useFetch } from "@/lib/useFetch";

/**
 * History filters (X-34; COVERAGE-MATRIX §5.1): date range, focus, domain, situation,
 * kind, activity type, result and stage E ("did anything change?"), kept in the URL so a filtered view can be shared,
 * reloaded and navigated back to. Used by the Observations tab and Development › Timeline.
 * No charts, counts or percentages: filters only narrow the list.
 */

export type FilterKey = "date_from" | "date_to" | "focus_area_id" | "domain" | "context" | "source" | "content_type" | "result" | "did_it_change";
export type FilterValues = Partial<Record<FilterKey, string>>;
export type FilterField = "dates" | "focus" | "domain" | "context" | "source" | "content_type" | "result" | "change";

const FIELD_KEYS: Record<FilterField, FilterKey[]> = {
  dates: ["date_from", "date_to"],
  focus: ["focus_area_id"],
  domain: ["domain"],
  context: ["context"],
  source: ["source"],
  content_type: ["content_type"],
  result: ["result"],
  change: ["did_it_change"],
};

/** Stage E of the observation model ("did anything change?"; observations.details.did_it_change). */
export const CHANGE_RESULTS = ["yes", "partly", "no"] as const;

/** Observation sources (observations.source). */
export const OBSERVATION_SOURCES = ["quick", "content_feedback"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Keep only values the API accepts (a hand-edited URL never breaks the page). */
function clean(key: FilterKey, value: string | null): string | undefined {
  if (!value) return undefined;
  if ((key === "date_from" || key === "date_to") && !ISO_DATE.test(value)) return undefined;
  if (key === "did_it_change" && !(CHANGE_RESULTS as readonly string[]).includes(value)) return undefined;
  return value;
}

/**
 * The filters of `fields` read from and written to the URL query. `types` (Timeline only)
 * is the repeated `type` parameter. Changing a filter replaces the history entry.
 */
export function useUrlFilters(fields: readonly FilterField[], { types: withTypes = false }: { types?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const keys = useMemo(() => fields.flatMap((f) => FIELD_KEYS[f]), [fields]);
  const search = params.toString();

  const values = useMemo(() => {
    const p = new URLSearchParams(search);
    const out: FilterValues = {};
    for (const k of keys) {
      const v = clean(k, p.get(k));
      if (v) out[k] = v;
    }
    return out;
  }, [search, keys]);
  const types = useMemo(() => (withTypes ? new URLSearchParams(search).getAll("type").filter(Boolean) : []), [search, withTypes]);

  const update = (fn: (next: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        fn(next);
        return next;
      },
      { replace: true },
    );

  return {
    values,
    types,
    active: Object.keys(values).length > 0 || types.length > 0,
    set: (key: FilterKey, value: string | null | undefined) =>
      update((next) => {
        if (value) next.set(key, value);
        else next.delete(key);
      }),
    setTypes: (list: readonly string[]) =>
      update((next) => {
        next.delete("type");
        for (const t of list) next.append("type", t);
      }),
    clear: () =>
      update((next) => {
        for (const k of keys) next.delete(k);
        next.delete("type");
      }),
  };
}

/** The API query string for the filters (types repeat the `type` key). */
export function filterQuery(values: FilterValues, types: readonly string[] = [], extra: Record<string, string | number> = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) qs.append(k, String(v));
  for (const [k, v] of Object.entries(values)) if (v) qs.append(k, v);
  for (const t of types) qs.append("type", t);
  return qs.toString();
}

type FocusOption = { id: string; title: string; status?: string };

/** The child's goals (all statuses) for the focus filter. */
function useFocusOptions(childId: string, enabled: boolean): FocusOption[] {
  const { data } = useFetch<{ focus_areas: FocusOption[] }>(enabled ? `/api/children/${encodeURIComponent(childId)}/focus-areas` : null);
  return data?.focus_areas ?? [];
}

/**
 * The filter bar: a "Filter" toggle that opens the fields, the active filters as
 * removable chips, and "Clear filters".
 */
export function HistoryFilterBar({
  childId,
  fields,
  values,
  onChange,
  onClear,
  extraActive = false,
}: {
  childId: string;
  fields: readonly FilterField[];
  values: FilterValues;
  onChange: (key: FilterKey, value: string | null) => void;
  onClear: () => void;
  /** Other active filters outside this bar (e.g. the timeline's type chips) also show "Clear filters". */
  extraActive?: boolean;
}) {
  const { t, locale } = useI18n();
  const { formatDate } = useFormat();
  const { list, optionLabel } = useOptions();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const focus = useFocusOptions(childId, fields.includes("focus"));
  const has = (f: FilterField) => fields.includes(f);

  const valueLabel = (key: FilterKey, v: string): string => {
    switch (key) {
      case "date_from":
        return t("history.filters.fromDate", { date: formatDate(`${v}T12:00:00`) });
      case "date_to":
        return t("history.filters.toDate", { date: formatDate(`${v}T12:00:00`) });
      case "focus_area_id":
        return `${t("history.filters.focus")}: ${focus.find((f) => f.id === v)?.title ?? "…"}`;
      case "domain":
        return optionLabel("ai_domains", v);
      case "context":
        return optionLabel("observation_contexts", v);
      case "source":
        return t(`history.sources.${v}`);
      case "content_type":
        return optionLabel("content_types", v);
      case "result":
        return optionLabel("content_results", v);
      case "did_it_change":
        return `${t("history.filters.change")}: ${t(`history.detail.changeValues.${v}`)}`;
    }
  };

  const activeKeys = (Object.keys(values) as FilterKey[]).filter((k) => values[k]);
  const optionsOf = (name: string) =>
    list(name).map((o) => (
      <option key={o.key} value={o.key}>
        {pick(o.short ?? o.label, locale) || o.key}
      </option>
    ));
  const select = (key: FilterKey, label: string, options: ReactNode) => (
    <Field label={label}>
      {(p) => (
        <Select {...p} value={values[key] ?? ""} onChange={(e) => onChange(key, e.target.value || null)} data-filter={key}>
          <option value="">{t("history.filters.any")}</option>
          {options}
        </Select>
      )}
    </Field>
  );

  return (
    <section aria-label={t("history.filters.label")} className="rounded-lg border border-line bg-surface p-3 md:p-4" data-testid="history-filters">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          icon={<SlidersHorizontal aria-hidden />}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          {t("history.filters.toggle")}
        </Button>
        {activeKeys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k, null)}
            aria-label={t("history.filters.remove", { label: valueLabel(k, values[k]!) })}
            data-active-filter={k}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border-[1.5px] border-brand bg-brand-soft px-2.5 text-sm font-medium text-ink hover:bg-surface any-pointer-coarse:min-h-11"
          >
            <span dir="auto">{valueLabel(k, values[k]!)}</span>
            <X className="size-4 shrink-0" aria-hidden />
          </button>
        ))}
        {(activeKeys.length > 0 || extraActive) && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            {t("history.filters.clear")}
          </Button>
        )}
      </div>
      {open && (
        <div id={panelId} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {has("dates") && (
            <>
              <Field label={t("history.filters.from")}>
                {(p) => (
                  <Input {...p} type="date" value={values.date_from ?? ""} max={values.date_to} onChange={(e) => onChange("date_from", e.target.value || null)} data-filter="date_from" />
                )}
              </Field>
              <Field label={t("history.filters.to")}>
                {(p) => (
                  <Input {...p} type="date" value={values.date_to ?? ""} min={values.date_from} onChange={(e) => onChange("date_to", e.target.value || null)} data-filter="date_to" />
                )}
              </Field>
            </>
          )}
          {has("focus") &&
            select(
              "focus_area_id",
              t("history.filters.focus"),
              focus.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              )),
            )}
          {has("domain") && select("domain", t("history.filters.domain"), optionsOf("ai_domains"))}
          {has("context") && select("context", t("history.filters.context"), optionsOf("observation_contexts"))}
          {has("source") &&
            select(
              "source",
              t("history.filters.source"),
              OBSERVATION_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`history.sources.${s}`)}
                </option>
              )),
            )}
          {has("content_type") && select("content_type", t("history.filters.contentType"), optionsOf("content_types"))}
          {has("change") &&
            select(
              "did_it_change",
              t("history.filters.change"),
              CHANGE_RESULTS.map((v) => (
                <option key={v} value={v}>
                  {t(`history.detail.changeValues.${v}`)}
                </option>
              )),
            )}
          {has("result") && select("result", t("history.filters.result"), optionsOf("content_results"))}
        </div>
      )}
    </section>
  );
}

import type { ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { NotAnswered } from "@/components/source";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import type { RegistryItem } from "@/lib/sourceModel";
import { useSourceModel } from "@/lib/sourceModel";
import type { ChildBasics } from "../api";
import { ChildFact } from "./controls";
import { asStrings, fieldOf, getPath, hasValue, isObj, optionsOf, partsOf, str, type SectionData } from "./model";

function Text({ children }: { children: ReactNode }) {
  return (
    <p className="text-base whitespace-pre-wrap text-ink" dir="auto">
      {children}
    </p>
  );
}

function Chips({ list, keys, extra }: { list: string; keys: string[]; extra?: string[] }) {
  const { optionLabel, item } = useOptions();
  if (!keys.length && !extra?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {keys.map((k) => (
        <Chip key={k} tone="neutral" icon={item(list, k)?.icon}>
          {optionLabel(list, k)}
        </Chip>
      ))}
      {extra?.map((x) => (
        <Chip key={`c:${x}`} tone="outline">
          {x}
        </Chip>
      ))}
    </div>
  );
}

function itemsKeys(v: unknown): { keys: string[]; customs: string[] } {
  const keys: string[] = [];
  const customs: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    if (typeof x === "string") keys.push(x);
    else if (isObj(x) && typeof x.key === "string") keys.push(x.key);
    else if (isObj(x) && typeof x.custom === "string") customs.push(x.custom);
  }
  return { keys, customs };
}

/**
 * One stored answer, read-only (Parent View, quick-baseline summary, history drawer).
 * Shows "Not answered" when the field holds nothing.
 */
export function AnswerView({ item, data, child }: { item: RegistryItem; data: SectionData; child?: ChildBasics }) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { optionLabel } = useOptions();
  const field = fieldOf(item);
  const value = getPath(data, field);
  const list = optionsOf(item);
  const parts = partsOf(sm.registry("parent_questionnaire"), item);

  if (item.kind === "child_fact") return <ChildFact item={item} child={child} />;
  const chipsField = isObj(item.chips) ? str(item.chips.field) : "";
  const filled = hasValue(value) || (chipsField && hasValue(data[chipsField]));
  if (!filled) return <NotAnswered />;

  switch (item.kind) {
    case "text":
      return <Text>{str(value)}</Text>;
    case "items": {
      const { keys, customs } = itemsKeys(value);
      return <Chips list={list} keys={keys} extra={customs} />;
    }
    case "choice_other": {
      const v = isObj(value) ? value : {};
      const other = str(v.other);
      return (
        <div className="space-y-2">
          <Chips list={list} keys={asStrings(v.selected).filter((k) => k !== "other")} />
          {(other || asStrings(v.selected).includes("other")) && (
            <Text>
              {t("wizard.questionnaire.other")}: {other || "—"}
            </Text>
          )}
        </div>
      );
    }
    case "yes_no_text":
    case "yes_no_text_keys": {
      const v = isObj(value) ? value : {};
      return (
        <div className="space-y-2">
          {str(v.value) && <p className="text-base font-medium text-ink">{optionLabel("yes_no", str(v.value))}</p>}
          {str(v.text) && <Text>{str(v.text)}</Text>}
          {item.kind === "yes_no_text_keys" && <Chips list={list} keys={asStrings(v[str(item.keys_field) || "keys"])} />}
        </div>
      );
    }
    case "text_chips": {
      const { keys, customs } = itemsKeys(data[chipsField]);
      return (
        <div className="space-y-2">
          {str(value) && <Text>{str(value)}</Text>}
          <Chips list={isObj(item.chips) ? str(item.chips.options) : ""} keys={keys} extra={customs} />
        </div>
      );
    }
    case "single":
      return <Chips list={list} keys={[str(value)]} />;
    case "text_keys": {
      const v = isObj(value) ? value : {};
      return (
        <div className="space-y-2">
          {str(v.text) && <Text>{str(v.text)}</Text>}
          <Chips list={list} keys={asStrings(v[str(item.keys_field) || "keys"])} />
        </div>
      );
    }
    case "multi_exclusive":
      return <Chips list={list} keys={asStrings(isObj(value) ? value.selected : undefined)} />;
    case "home_language": {
      const v = isObj(value) ? value : {};
      return (
        <div className="space-y-2">
          {str(v.value) && <p className="text-base font-medium text-ink">{optionLabel("yes_no", str(v.value))}</p>}
          <Chips list="languages" keys={asStrings(v.languages).filter((k) => k !== "other")} extra={str(v.other_text) ? [str(v.other_text)] : undefined} />
        </div>
      );
    }
    case "levels_table": {
      const levels = isObj(value) ? value : {};
      const amounts = isObj(data.help_amount) ? data.help_amount : {};
      return (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {parts.map((row) => {
              const area = str(row.area);
              const level = str(levels[area]);
              const amount = str(amounts[area]);
              return (
                <tr key={row.id} data-row={area}>
                  <th scope="row" className="py-2 pe-3 text-start font-medium text-ink">
                    {sm.label(row)}
                  </th>
                  <td className="py-2 text-ink">
                    {level ? (
                      <>
                        {optionLabel(optionsOf(item) || "pq_independence_levels", level)}
                        {amount && <span className="text-ink-muted"> · {optionLabel(str(item.amount_options) || "pq_help_amount", amount)}</span>}
                      </>
                    ) : (
                      <NotAnswered />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }
    case "develop": {
      const v = isObj(value) ? value : {};
      return (
        <dl className="space-y-2">
          {parts.map((p) => {
            const box = isObj(v[str(p.area)]) ? (v[str(p.area)] as Record<string, unknown>) : {};
            if (!hasValue(box)) return null;
            const head = p.kind === "develop_other" && str(box.area) ? `${sm.label(p)}: ${str(box.area)}` : sm.label(p);
            return (
              <div key={p.id}>
                <dt className="text-sm font-semibold text-ink">{head}</dt>
                {str(box.text) && (
                  <dd className="text-base whitespace-pre-wrap text-ink" dir="auto">
                    {str(box.text)}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      );
    }
    case "parents": {
      const rows = Array.isArray(value) ? value.filter(isObj) : [];
      return (
        <ul className="space-y-1">
          {rows.map((r, i) => (
            <li key={i} className="text-base text-ink">
              <bdi>{str(r.name)}</bdi>
              {str(r.relation) && <span className="text-ink-muted"> · {optionLabel("relations", str(r.relation))}</span>}
            </li>
          ))}
        </ul>
      );
    }
    default:
      return typeof value === "string" ? <Text>{value}</Text> : null;
  }
}

/** A value of the earlier form (legacy keys), read-only. */
export function LegacyValueView({ kind, options, value }: { kind: string; options?: string; value: unknown }) {
  const { optionLabel } = useOptions();
  if (kind === "text") return <Text>{str(value)}</Text>;
  if (kind === "single") return <Chips list={options ?? ""} keys={[str(value)]} />;
  if (kind === "keys") return <Chips list={options ?? ""} keys={asStrings(value)} />;
  if (kind === "levels") {
    const levels = isObj(value) ? value : {};
    return (
      <ul className="space-y-1 text-sm text-ink">
        {Object.entries(levels).map(([area, level]) => (
          <li key={area}>
            {optionLabel(options ?? "independence_areas", area)}: {optionLabel("support_levels", str(level))}
          </li>
        ))}
      </ul>
    );
  }
  const { keys, customs } = itemsKeys(value);
  return <Chips list={options ?? ""} keys={keys} extra={customs} />;
}

import { Checkbox, Spinner } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useFetch } from "@/lib/useFetch";
import { displayName } from "./api";
import type { ChildListResponse } from "./types";

/**
 * Checkboxes for the children of the user's classes (GET /api/children), without
 * archived children and `excludeId`. Used to copy or assign content to children.
 */
export function ChildPicker({
  selected,
  onToggle,
  excludeId,
  label,
}: {
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  excludeId?: string | null;
  label: string;
}) {
  const { t } = useI18n();
  const { data, loading } = useFetch<ChildListResponse>("/api/children");
  const children = (data?.children ?? []).filter((c) => c.id !== excludeId && !c.archived);
  if (loading && !data) return <Spinner label={t("common.loading")} />;
  if (children.length === 0) return <p className="text-sm text-ink-muted">{t("children.picker.none")}</p>;
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <ul className="divide-y divide-line">
        {children.map((c) => (
          <li key={c.id}>
            <Checkbox
              checked={selected.has(c.id)}
              onChange={(e) => onToggle(c.id, e.target.checked)}
              label={
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span dir="auto" className="font-medium">
                    {displayName(c)}
                  </span>
                  {c.class && (
                    <span dir="auto" className="text-caption text-ink-muted">
                      {c.class.name}
                    </span>
                  )}
                </span>
              }
            />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** Selection state for ChildPicker. */
export function toggleIn(prev: Set<string>, id: string, on: boolean): Set<string> {
  const next = new Set(prev);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

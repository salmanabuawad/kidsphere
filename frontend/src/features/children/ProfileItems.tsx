import { useCallback } from "react";
import { Chip, type Tone } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions, type OptionItem } from "@/lib/options";
import type { ProfileItem } from "./types";

/** Lists a merged what_helps key may come from when the item does not say (WP-06 sets item.list). */
const HELPS_LISTS = ["what_helps", "calming_helps", "transition_helps", "sad_helps", "sensitivity_helps"];

/**
 * Resolve a profile item to {label, icon}: an option key → its label in the UI
 * language (useOptions().optionLabel); a custom entry → its own text.
 */
export function useProfileItem() {
  const { item: optionItem, labelOf } = useOptions();
  return useCallback(
    (list: string, it: ProfileItem): { label: string; icon?: string; custom: boolean } => {
      if (it.custom) return { label: it.custom, custom: true };
      const key = it.key ?? "";
      const candidates = it.list ? [it.list] : list === "what_helps" ? HELPS_LISTS : [list];
      let found: OptionItem | undefined;
      for (const l of candidates) {
        found = optionItem(l, key);
        if (found) break;
      }
      return found ? { label: labelOf(found), icon: found.icon, custom: false } : { label: key, custom: false };
    },
    [optionItem, labelOf],
  );
}

const itemKey = (it: ProfileItem, i: number) => (it.key ? `k:${it.key}:${it.list ?? ""}` : `c:${it.custom ?? i}`);

/**
 * Chips for one profile list. Strengths are emerald (⭐), interests sky (option
 * icon), what helps violet (✓). `fallbackIcon` is used when the option has no icon.
 */
export function ProfileItemChips({
  list,
  items,
  tone,
  fallbackIcon,
  limit,
  size = "md",
}: {
  list: string;
  items: ProfileItem[];
  tone: Tone;
  fallbackIcon?: string;
  limit?: number;
  size?: "sm" | "md";
}) {
  const resolve = useProfileItem();
  const { t } = useI18n();
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="flex flex-wrap gap-2">
      {shown.map((it, i) => {
        const r = resolve(list, it);
        const sources = (it.sources ?? []).map((s) => t(`children.profile.sources.${s}`)).join(" · ");
        return (
          <li key={itemKey(it, i)} title={sources || undefined}>
            <Chip tone={tone} icon={r.icon ?? fallbackIcon} className={size === "md" ? "min-h-10 px-3.5 text-[0.95rem]" : undefined}>
              {r.label}
            </Chip>
          </li>
        );
      })}
    </ul>
  );
}

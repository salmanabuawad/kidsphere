import { useCallback, useState, type ReactNode } from "react";
import { Chip, toneGlyph, type Tone } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions, type OptionItem } from "@/lib/options";
import type { ProfileItem } from "./types";

/** Lists a merged what_helps key may come from when the item does not say (WP-06 sets item.list). */
const HELPS_LISTS = ["what_helps", "calming_helps", "transition_helps", "sad_helps", "sensitivity_helps"];

/** At most this many chips per profile section; the rest sit behind a "+N" chip (spec 6.3). */
export const SECTION_CHIP_CAP = 5;

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
 * Chips for one profile list in the list's tone. `fallbackIcon` is used (for other
 * tones) when the option has no emoji. `limit` caps the chips; with `cap` the rest open
 * from a "+N" chip.
 */
export function ProfileItemChips({
  list,
  items,
  tone,
  fallbackIcon,
  limit,
  cap,
}: {
  list: string;
  items: ProfileItem[];
  tone: Tone;
  fallbackIcon?: ReactNode;
  limit?: number;
  /** Show this many, then a "+N" button that reveals the rest. */
  cap?: number;
  /** Kept for callers; chips have one size. */
  size?: "sm" | "md";
}) {
  const resolve = useProfileItem();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const limited = limit ? items.slice(0, limit) : items;
  const capped = cap !== undefined && !open && limited.length > cap;
  const shown = capped ? limited.slice(0, cap) : limited;
  return (
    <ul className="flex flex-wrap gap-2">
      {shown.map((it, i) => {
        const r = resolve(list, it);
        const sources = (it.sources ?? []).map((s) => t(`children.profile.sources.${s}`)).join(" · ");
        return (
          <li key={itemKey(it, i)} title={sources || undefined}>
            <Chip tone={tone} icon={toneGlyph(tone, r.icon, fallbackIcon)}>
              {r.label}
            </Chip>
          </li>
        );
      })}
      {capped && (
        <li>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="tabular inline-flex min-h-8 items-center rounded-sm bg-tray px-2.5 text-sm font-semibold text-ink transition-colors hover:bg-line any-pointer-coarse:min-h-11"
          >
            <span dir="ltr">+{limited.length - cap!}</span>
          </button>
        </li>
      )}
    </ul>
  );
}

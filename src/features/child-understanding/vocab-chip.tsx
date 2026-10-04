import type { AttributeCategory } from "@prisma/client";
import type { AppLocale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import { vocabEntry, vocabLabel } from "./vocabulary";

const TONES: Partial<Record<AttributeCategory, string>> = {
  STRENGTH: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  INTEREST: "bg-sky-50 text-sky-900 ring-sky-200",
  SUPPORT: "bg-violet-50 text-violet-900 ring-violet-200",
  TRIGGER: "bg-amber-50 text-amber-900 ring-amber-200",
};

/** A profile value rendered as a soft chip with its emoji. */
export function VocabChip({
  category,
  value,
  locale,
  size = "md",
  className,
}: {
  category: AttributeCategory;
  value: string;
  locale: AppLocale;
  size?: "md" | "lg";
  className?: string;
}) {
  const e = vocabEntry(category, value);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset",
        TONES[category] ?? "bg-stone-50 text-stone-800 ring-stone-200",
        size === "lg" ? "px-3.5 py-1.5 text-sm font-medium" : "px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {e?.emoji && <span aria-hidden>{e.emoji}</span>}
      {vocabLabel(category, value, locale)}
    </span>
  );
}

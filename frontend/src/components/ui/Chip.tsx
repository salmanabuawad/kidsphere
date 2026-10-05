import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneClasses, type Tone } from "./Badge";

/**
 * Display chip for profile items (strengths, interests, what helps…).
 * `icon` is usually the option emoji from /api/options.
 */
export function Chip({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ring-inset", toneClasses[tone], className)}>
      {icon && (
        <span aria-hidden className="text-base leading-none">
          {icon}
        </span>
      )}
      <span dir="auto">{children}</span>
    </span>
  );
}

const selectedTone: Partial<Record<Tone, string>> = {
  strength: "border-emerald-600 bg-emerald-600 text-white",
  interest: "border-sky-600 bg-sky-600 text-white",
  helps: "border-violet-600 bg-violet-600 text-white",
  attention: "border-amber-600 bg-amber-600 text-white",
};

/** Multi-select toggle chip (aria-pressed), 44px tall touch target. */
export function ToggleChip({
  selected,
  onToggle,
  icon,
  children,
  tone = "brand",
  disabled,
  className,
}: {
  selected: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  children: ReactNode;
  /** Colour when selected; brand by default. */
  tone?: Tone;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
        selected
          ? (selectedTone[tone] ?? "border-brand bg-brand text-brand-ink")
          : "border-line bg-white text-ink hover:border-stone-300 hover:bg-stone-50",
        className,
      )}
    >
      {selected && <Check className="size-4 shrink-0" aria-hidden />}
      {icon && (
        <span aria-hidden className="text-base leading-none">
          {icon}
        </span>
      )}
      <span dir="auto">{children}</span>
    </button>
  );
}

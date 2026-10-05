import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { AttentionIcon, InterestsIcon, StrengthsIcon, WhatHelpsIcon } from "@/icons";
import { cn } from "@/lib/utils";
import { toneClasses, type Tone } from "./Badge";

/**
 * The leading slot of a chip: a string is an option emoji (content, the child's own
 * world), shown at 16px inside a 24px `surface` pod; anything else (a painted 16px
 * icon, a numeral block) is shown as is.
 */
function Lead({ icon }: { icon: ReactNode }) {
  if (typeof icon === "string")
    return (
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-base leading-none">
        {icon}
      </span>
    );
  return (
    <span aria-hidden className="flex shrink-0 items-center [&_svg]:size-4">
      {icon}
    </span>
  );
}

/** A 22px numeral block (1–3) for Current focus: solid grape, on-brand numeral in the display face. */
export function NumeralBlock({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "font-display tabular inline-flex size-[22px] shrink-0 items-center justify-center rounded-sm bg-focus-ink text-caption leading-4 font-bold text-on-brand",
        className,
      )}
    >
      {n}
    </span>
  );
}

/**
 * Display chip (spec 6.3) for profile items: a block (radius-sm, not a pill), the tone's
 * soft fill, an `ink` label. `icon` is the option emoji (shown in a pod) or a painted icon.
 */
export function Chip({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-sm px-2.5 py-1 text-sm font-medium",
        icon != null && icon !== "" && "ps-1.5",
        toneClasses[tone],
        className,
      )}
    >
      {icon != null && icon !== "" && <Lead icon={icon} />}
      <span dir="auto">{children}</span>
    </span>
  );
}

/** Selected look per tone: soft fill + 2px tone-ink border (multi), or a solid tone-ink fill (single). */
const SELECTED: Partial<Record<Tone, { multi: string; single: string; check: string }>> = {
  brand: { multi: "border-brand bg-brand-soft", single: "border-brand bg-brand text-on-brand", check: "text-brand" },
  strength: { multi: "border-strength-ink bg-strength-soft", single: "border-strength-ink bg-strength-ink text-on-brand", check: "text-strength-ink" },
  interest: { multi: "border-interest-ink bg-interest-soft", single: "border-interest-ink bg-interest-ink text-on-brand", check: "text-interest-ink" },
  helps: { multi: "border-helps-ink bg-helps-soft", single: "border-helps-ink bg-helps-ink text-on-brand", check: "text-helps-ink" },
  focus: { multi: "border-focus-ink bg-focus-soft", single: "border-focus-ink bg-focus-ink text-on-brand", check: "text-focus-ink" },
  attention: { multi: "border-attention-ink bg-attention-soft", single: "border-attention-ink bg-attention-ink text-on-brand", check: "text-attention-ink" },
};
const ALIAS: Partial<Record<Tone, Tone>> = { green: "helps", sky: "brand", violet: "focus", amber: "attention" };

/**
 * Toggle chip (spec 6.3), 44px tall. Unselected: a surface block with a line-strong
 * border. Multi-select (default): a toggle button with aria-pressed; selected = the list's
 * tone (soft fill, 2px tone-ink border and a Check). With `single`, a one-of-many choice:
 * role="radio" with aria-checked (put the chips in a role="radiogroup"); selected = a
 * solid tone-ink fill.
 */
export function ToggleChip({
  selected,
  onToggle,
  icon,
  children,
  tone = "brand",
  single,
  disabled,
  className,
}: {
  selected: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  children: ReactNode;
  /** The list's tone when selected; brand by default. */
  tone?: Tone;
  /** One-of-many choice: the selected chip is a solid tone-ink block. */
  single?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const look = SELECTED[ALIAS[tone] ?? tone] ?? SELECTED.brand!;
  return (
    <button
      type="button"
      {...(single ? { role: "radio", "aria-checked": selected } : { "aria-pressed": selected })}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "ks-press animate-placed inline-flex min-h-11 items-center gap-2 rounded-sm border-[1.5px] px-3.5 py-1.5 text-sm text-ink active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? cn("border-2 px-[13px] font-semibold", single ? look.single : look.multi)
          : "border-line-strong bg-surface font-medium hover:bg-tray",
        icon != null && icon !== "" && "ps-2",
        className,
      )}
    >
      {selected && <Check className={cn("size-4 shrink-0", single ? "text-on-brand" : look.check)} strokeWidth={2.5} aria-hidden />}
      {icon != null && icon !== "" && <Lead icon={icon} />}
      <span dir="auto">{children}</span>
    </button>
  );
}

/**
 * The leading glyph of a meaning chip (spec 6.3, "one glyph per slot"): strengths lead
 * with the painted star, what helps with the ticked block, attention with the eye;
 * interests with the option emoji (shown in a pod) or else the heart. Other tones use
 * the emoji, or `fallback`.
 */
export function toneGlyph(tone: Tone, emoji?: string | null, fallback?: ReactNode): ReactNode {
  switch (tone) {
    case "strength":
      return <StrengthsIcon size={16} />;
    case "helps":
    case "green":
      return <WhatHelpsIcon size={16} />;
    case "attention":
    case "amber":
      return <AttentionIcon size={16} />;
    case "interest":
      return emoji || <InterestsIcon size={16} />;
    default:
      return emoji || fallback;
  }
}

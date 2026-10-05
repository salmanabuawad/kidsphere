import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Meaning tones (spec 2.2). A tone is always paired with its icon and its word;
 * labels on tints stay `ink` (brand-on-brand-soft is the one coloured-text pair).
 *   strength = sunflower, interest = berry, helps = leaf, focus = grape,
 *   attention = tangerine ("worth a look", never red), brand = act / "you are here",
 *   neutral = tray, muted = tray with a muted label (Draft, Archived),
 *   success = a bordered "Approved" (never on a helps tint), danger = system errors only,
 *   outline = a plain surface chip.
 * green/sky/violet/amber/rose/stone are aliases kept for ported code.
 */
export type Tone =
  | "neutral"
  | "muted"
  | "brand"
  | "strength"
  | "interest"
  | "helps"
  | "focus"
  | "attention"
  | "success"
  | "danger"
  | "outline"
  | "green"
  | "sky"
  | "violet"
  | "amber"
  | "rose"
  | "stone";

const TONES = {
  neutral: "bg-tray text-ink",
  muted: "bg-tray text-ink-muted",
  brand: "bg-brand-soft text-brand",
  strength: "bg-strength-soft text-ink",
  interest: "bg-interest-soft text-ink",
  helps: "bg-helps-soft text-ink",
  focus: "bg-focus-soft text-ink",
  attention: "bg-attention-soft text-ink",
  success: "border-[1.5px] border-success bg-surface text-success",
  danger: "border-[1.5px] border-danger bg-surface text-danger",
  outline: "border border-line bg-surface text-ink",
} as const;

/** Fill + label colour per tone (no size): for custom chip-like controls. */
export const toneClasses: Record<Tone, string> = {
  ...TONES,
  green: TONES.helps,
  sky: TONES.brand,
  violet: TONES.focus,
  amber: TONES.attention,
  rose: TONES.danger,
  stone: TONES.outline,
};

/** Status badge (spec 6.4): 24px block, caption 500, optional 12–14px leading glyph, no wrapping. */
export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-caption inline-flex min-h-6 items-center gap-1 rounded-sm px-2 font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
        toneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

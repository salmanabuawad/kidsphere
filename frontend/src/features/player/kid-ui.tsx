import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";
import { ArrowNextIcon, StrengthsIcon } from "@/icons";
import { cn } from "@/lib/utils";
import type { Dir } from "./content-locale";

/**
 * Child-facing building blocks for "present" mode on a tablet (spec 6.10): the block
 * corner made big. Chunky toy-key buttons with a hard lip, picture cards with a 3px
 * colouring-book outline around a painted picture block, a sun-yellow round arrow,
 * gentle bubbles. Very large touch targets (≥64px, never below 56). Never red, never
 * an X, no points or scores. Content text is always rendered as plain text.
 */

/**
 * Forward/back arrows that follow the content's reading direction (not the UI's), so
 * the mirroring is explicit: `data-arrow` says which way the arrow points.
 */
export function NextArrow({ dir, className }: { dir: Dir; className?: string }) {
  const rtl = dir === "rtl";
  return <ArrowNextIcon mirror={false} className={cn("size-9", rtl && "-scale-x-100", className)} aria-hidden data-arrow={rtl ? "left" : "right"} />;
}

export function BackArrow({ dir, className }: { dir: Dir; className?: string }) {
  const rtl = dir === "rtl";
  return <ArrowNextIcon mirror={false} className={cn("size-9", !rtl && "-scale-x-100", className)} aria-hidden data-arrow={rtl ? "right" : "left"} />;
}

/** A decorative emoji picture (screen readers read the label next to it instead). */
export function Pic({ emoji, className }: { emoji?: string | null; className?: string }) {
  if (!emoji) return null;
  return (
    <span className={cn("leading-none select-none", className)} aria-hidden>
      {emoji}
    </span>
  );
}

/** The six play paints, in tile order. In present mode they are pure play colours, never meanings. */
export const PLAY_PAINTS = ["bg-paint-sun", "bg-paint-sky", "bg-paint-berry", "bg-paint-leaf", "bg-paint-tangerine", "bg-paint-grape"] as const;
export const playPaint = (i: number) => PLAY_PAINTS[((i % PLAY_PAINTS.length) + PLAY_PAINTS.length) % PLAY_PAINTS.length]!;

/** A star sticker: the gold star (sun paint, ink outline). `outline` leaves it unpainted. */
export function StarSticker({ size = 40, outline, className, style }: { size?: number; outline?: boolean; className?: string; style?: CSSProperties }) {
  return <StrengthsIcon size={size} paint={outline ? false : undefined} className={cn("text-ink", className)} style={style} aria-hidden />;
}

type KidButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children: ReactNode;
  tone?: "brand" | "plain";
};

/** Big toy-key button with text (64px, 72 from md): the display face, a hard lip, sinks when pressed. */
export function KidButton({ children, tone = "brand", className, type = "button", ...props }: KidButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "ks-press font-display text-kid-label inline-flex min-h-16 min-w-16 items-center justify-center gap-3 rounded-xl px-7 font-semibold select-none md:min-h-[72px] [&_svg]:size-7 [&_svg]:shrink-0",
        "active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none",
        tone === "brand"
          ? "bg-brand text-on-brand shadow-lip-brand hover:bg-brand-strong"
          : "border-[3px] border-ink bg-surface text-ink shadow-lip-lg hover:bg-tray",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Round icon-only button (72px, 80 from md); `label` is required for screen readers.
 * sun (default): the sun-yellow crayon with a 3px graphite outline. brand: solid toy blue.
 * plain: a surface ball with a 3px ink outline.
 */
export function RoundButton({
  label,
  children,
  tone = "sun",
  className,
  type = "button",
  ...props
}: Omit<KidButtonProps, "tone"> & { label: string; tone?: "sun" | "brand" | "plain" }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "ks-press inline-flex size-[72px] shrink-0 items-center justify-center rounded-full shadow-lip-lg select-none md:size-20",
        "active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none",
        tone === "sun" && "border-[3px] border-on-paint bg-paint-sun text-on-paint hover:brightness-105",
        tone === "brand" && "bg-brand text-on-brand hover:bg-brand-strong",
        tone === "plain" && "border-[3px] border-ink bg-surface text-ink hover:bg-tray",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export type CardState = "idle" | "selected" | "preferred" | "other" | "suggested" | "done" | "hint";

/** Fill and colouring-book outline per state (the outline is an overlay, so sizes never jump). */
const cardStates: Record<CardState, { tile: string; outline: string }> = {
  idle: { tile: "bg-surface shadow-lip-lg", outline: "border-[3px] border-ink" },
  selected: { tile: "bg-brand-soft shadow-lip-lg", outline: "border-4 border-brand" },
  preferred: { tile: "bg-helps-soft shadow-lip-lg", outline: "border-4 border-success" },
  other: { tile: "bg-attention-soft shadow-lip-lg", outline: "border-4 border-attention-ink" },
  suggested: { tile: "animate-nudge bg-surface shadow-lip-lg", outline: "border-4 border-dashed border-success" },
  done: { tile: "bg-tray", outline: "border-[3px] border-line-strong" },
  hint: { tile: "animate-wiggle bg-strength-soft shadow-lip-lg", outline: "border-4 border-dashed border-strength-ink" },
};

/** A small solid block with a check, at the top inline-end of a tile. */
function CheckBlock({ className }: { className?: string }) {
  return (
    <span className={cn("absolute end-2 top-2 flex size-7 items-center justify-center rounded-sm text-on-brand", className)} aria-hidden>
      <Check className="size-5" strokeWidth={3} />
    </span>
  );
}

/**
 * A big tappable picture card: a painted picture block (colour by tile position, via
 * `paint`) with the emoji in a surface pod, the label below. Without an emoji the pod
 * shows the label's first letter. States never use red or an X.
 */
export function ChoiceCard({
  label,
  emoji,
  state = "idle",
  size = "md",
  paint = 0,
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  emoji?: string | null;
  state?: CardState;
  size?: "md" | "lg";
  /** The tile's position: picks its play paint (sun, sky, berry, leaf, tangerine, grape). */
  paint?: number;
}) {
  const lg = size === "lg";
  const s = cardStates[state];
  return (
    <button
      type="button"
      aria-pressed={state === "selected" || state === "preferred" || state === "other" ? true : undefined}
      data-state={state}
      className={cn(
        "ks-press relative flex w-full flex-col items-center justify-center gap-2 rounded-xl p-3 text-center select-none focus-visible:outline-offset-[3px]",
        lg ? "min-h-[150px] md:min-h-[180px]" : "min-h-[120px] md:min-h-[140px]",
        "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:cursor-default disabled:hover:translate-y-0 disabled:active:translate-y-0",
        s.tile,
        className,
      )}
      {...props}
    >
      <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-xl", s.outline)} />
      <span
        aria-hidden
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-lg",
          lg ? "size-[104px] md:size-[120px]" : "size-20 md:size-[88px]",
          playPaint(paint),
          state === "done" && "opacity-60",
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-surface leading-none",
            lg ? "size-[76px] text-[3.25rem] md:size-[88px] md:text-[4rem]" : "size-14 text-[2.25rem] md:size-16 md:text-[2.75rem]",
          )}
        >
          {emoji ? (
            <Pic emoji={emoji} />
          ) : (
            <span className="font-display text-kid-label font-semibold text-ink">{Array.from(label.trim())[0] ?? ""}</span>
          )}
        </span>
      </span>
      <span dir="auto" className={cn("font-display text-kid-label relative line-clamp-2 font-medium", state === "done" ? "text-ink-muted" : "text-ink")}>
        {label}
      </span>
      {state === "selected" && <CheckBlock className="bg-brand" />}
      {state === "done" && <CheckBlock className="bg-success" />}
      {state === "preferred" && <StarSticker size={40} className="animate-stamp absolute end-1.5 top-1.5" />}
      {state === "suggested" && <StarSticker size={28} outline className="absolute end-2 top-2" />}
    </button>
  );
}

/** Gentle feedback bubble (never "wrong", never a score). warm carries a sun-star sticker. */
export function Feedback({ tone, title, children }: { tone: "warm" | "think" | "calm"; title: string; children?: ReactNode }) {
  const tones = { warm: "bg-helps-soft", think: "bg-attention-soft", calm: "bg-brand-soft" };
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("animate-bounce-place mx-auto flex w-full max-w-[640px] flex-col items-center rounded-xl px-6 py-5 text-center text-ink", tones[tone])}
    >
      {tone === "warm" && <StarSticker size={40} className="animate-stamp mb-1" />}
      <p className="font-display text-kid-label font-semibold">{title}</p>
      {children && (
        <p dir="auto" className="font-display mt-2 text-xl leading-[1.875rem] font-medium">
          {children}
        </p>
      )}
    </div>
  );
}

/** Title + optional intro on top of a game or story. */
export function KidHeading({ title, intro }: { title: string; intro?: string | null }) {
  return (
    <header className="text-center">
      <h2 dir="auto" className="font-display text-display-lg md:text-display-xl font-semibold text-ink">
        {title}
      </h2>
      {intro && (
        <p dir="auto" className="mx-auto mt-2 max-w-[40ch] text-xl leading-[1.875rem] text-ink-muted">
          {intro}
        </p>
      )}
    </header>
  );
}

/** Progress blocks (no numbers, no counts): done, the current wide block, upcoming outlines. */
export function Dots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-3 transition-[width,background-color] duration-150",
            i === current ? "w-7 rounded-[6px] bg-brand" : i < current ? "w-3 rounded-[4px] border-2 border-brand bg-brand-soft" : "w-3 rounded-[4px] border-2 border-line-strong",
          )}
        />
      ))}
    </div>
  );
}

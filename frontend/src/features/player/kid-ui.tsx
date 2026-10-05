import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dir } from "./content-locale";

/**
 * Child-facing building blocks for "present" mode on a tablet: very large
 * touch targets (≥56px), high contrast, calm colours, emoji visuals.
 * Content text is always rendered as plain text (React escapes it).
 */

/** Forward/back arrows that follow the reading direction. */
export function NextArrow({ dir, className }: { dir: Dir; className?: string }) {
  const Icon = dir === "rtl" ? ArrowLeft : ArrowRight;
  return <Icon className={cn("size-8", className)} aria-hidden data-arrow={dir === "rtl" ? "left" : "right"} />;
}

export function BackArrow({ dir, className }: { dir: Dir; className?: string }) {
  const Icon = dir === "rtl" ? ArrowRight : ArrowLeft;
  return <Icon className={cn("size-8", className)} aria-hidden data-arrow={dir === "rtl" ? "right" : "left"} />;
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

type KidButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children: ReactNode;
  tone?: "brand" | "plain";
};

/** Big pill button with text (≥56px tall). */
export function KidButton({ children, tone = "brand", className, type = "button", ...props }: KidButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-16 min-w-16 items-center justify-center gap-3 rounded-full px-7 text-xl font-semibold shadow-md transition select-none active:scale-95 disabled:opacity-40 md:text-2xl",
        tone === "brand" ? "bg-brand text-white hover:bg-brand-strong" : "bg-white text-ink ring-2 ring-stone-200 hover:bg-stone-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Round icon-only button (≥64px); `label` is required for screen readers. */
export function RoundButton({ label, children, tone = "plain", className, type = "button", ...props }: KidButtonProps & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-16 shrink-0 items-center justify-center rounded-full shadow-md transition select-none active:scale-95 disabled:opacity-40 md:size-20",
        tone === "brand" ? "bg-brand text-white hover:bg-brand-strong" : "bg-white text-ink ring-2 ring-stone-200 hover:bg-stone-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export type CardState = "idle" | "selected" | "preferred" | "other" | "suggested" | "done" | "hint";

const cardStates: Record<CardState, string> = {
  idle: "bg-white ring-stone-200 hover:ring-brand/40",
  selected: "bg-sky-50 ring-sky-500",
  preferred: "bg-emerald-50 ring-emerald-500",
  other: "bg-amber-50 ring-amber-400",
  suggested: "bg-white ring-emerald-300",
  done: "bg-emerald-50 ring-emerald-300 opacity-70",
  hint: "bg-amber-50 ring-amber-300",
};

/** A big tappable picture card: emoji on top, label below. */
export function ChoiceCard({
  label,
  emoji,
  state = "idle",
  size = "md",
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  emoji?: string | null;
  state?: CardState;
  size?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      aria-pressed={state === "selected" || state === "preferred" || state === "other" ? true : undefined}
      data-state={state}
      className={cn(
        "flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-3xl p-4 text-center shadow-sm ring-4 transition select-none active:scale-95 disabled:cursor-default disabled:active:scale-100",
        cardStates[state],
        className,
      )}
      {...props}
    >
      <Pic emoji={emoji} className={size === "lg" ? "text-7xl md:text-8xl" : "text-5xl md:text-6xl"} />
      <span dir="auto" className="text-xl font-semibold text-ink md:text-2xl">
        {label}
      </span>
    </button>
  );
}

/** Gentle feedback bubble (never "wrong", never a score). */
export function Feedback({ tone, title, children }: { tone: "warm" | "think" | "calm"; title: string; children?: ReactNode }) {
  const tones = {
    warm: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    think: "bg-amber-50 text-amber-900 ring-amber-200",
    calm: "bg-sky-50 text-sky-900 ring-sky-200",
  };
  return (
    <div role="status" aria-live="polite" className={cn("animate-pop mx-auto w-full max-w-2xl rounded-3xl px-6 py-5 text-center ring-2", tones[tone])}>
      <p className="text-2xl font-bold md:text-3xl">{title}</p>
      {children && (
        <p dir="auto" className="mt-2 text-lg md:text-xl">
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
      <h2 dir="auto" className="text-2xl font-bold text-stone-800 md:text-3xl">
        {title}
      </h2>
      {intro && (
        <p dir="auto" className="mx-auto mt-2 max-w-2xl text-lg text-stone-600 md:text-xl">
          {intro}
        </p>
      )}
    </header>
  );
}

/** Progress dots (no numbers, no counts). */
export function Dots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex justify-center gap-2" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("size-3 rounded-full", i === current ? "bg-brand" : i < current ? "bg-brand/40" : "bg-stone-300")} />
      ))}
    </div>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Meaning-coded tones: strength = emerald, interest = sky, helps = violet,
 * attention = amber (never red for educational needs), danger = rose (errors only).
 * green/sky/violet/amber/rose/stone are aliases kept for ported code.
 */
export type Tone =
  | "neutral"
  | "brand"
  | "strength"
  | "interest"
  | "helps"
  | "attention"
  | "danger"
  | "outline"
  | "green"
  | "sky"
  | "violet"
  | "amber"
  | "rose"
  | "stone";

export const toneClasses: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  brand: "bg-brand-soft text-brand ring-brand/20",
  strength: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  interest: "bg-sky-50 text-sky-800 ring-sky-200",
  helps: "bg-violet-50 text-violet-800 ring-violet-200",
  attention: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-800 ring-rose-200",
  outline: "bg-white text-stone-600 ring-stone-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  sky: "bg-sky-50 text-sky-800 ring-sky-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  rose: "bg-rose-50 text-rose-800 ring-rose-200",
  stone: "bg-white text-stone-600 ring-stone-200",
};

export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        toneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

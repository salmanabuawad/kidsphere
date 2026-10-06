import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export type ScaleOption = { key: string; label: string };

const COLS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

/**
 * The SupportScale (design spec 6.8): a radiogroup on a `tray` track, one neutral look for
 * every level (never colour-coded, never red). The selected segment is a `surface` block
 * with a 2px brand border, the lip and a Check. Arrow keys move the choice in reading
 * direction (RTL-aware); tapping the selected segment again clears it ("not rated").
 */
export function SupportScale({
  options,
  value,
  onChange,
  label,
  disabled,
  size = "md",
  className,
}: {
  options: readonly ScaleOption[];
  value: string | null | undefined;
  onChange: (key: string | null) => void;
  /** Accessible name of the group (the question or the item). */
  label: string;
  disabled?: boolean;
  /** md: 44px segments; lg: 64px segments for the quick form. */
  size?: "md" | "lg";
  className?: string;
}) {
  const { dir } = useI18n();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.findIndex((o) => o.key === value);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    let step = 0;
    if (e.key === forward || e.key === "ArrowDown") step = 1;
    else if (e.key === backward || e.key === "ArrowUp") step = -1;
    else return;
    e.preventDefault();
    const from = current < 0 ? (step > 0 ? -1 : 0) : current;
    const next = (from + step + options.length) % options.length;
    onChange(options[next]!.key);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={disabled ? undefined : onKeyDown}
      className={cn("grid gap-1 rounded-md bg-tray p-1", COLS[options.length] ?? "grid-cols-4", className)}
    >
      {options.map((o, i) => {
        const on = i === current;
        return (
          <button
            key={o.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(on ? null : o.key)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md border-2 px-1.5 py-1.5 text-center text-sm leading-tight transition-colors disabled:cursor-not-allowed",
              size === "lg" ? "min-h-16 sm:text-base" : "min-h-11",
              on ? "border-brand bg-surface font-semibold text-ink shadow-lip" : "border-transparent font-medium text-ink-muted hover:text-ink",
            )}
          >
            {on && <Check className="size-4 shrink-0 text-brand" strokeWidth={2.5} aria-hidden />}
            <span dir="auto">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

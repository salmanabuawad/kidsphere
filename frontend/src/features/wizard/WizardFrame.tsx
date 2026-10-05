import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/**
 * Progress indicator: one segment per step. `current` is 1-based within
 * `total`; done steps are filled. Segments are buttons when `onPick` is set.
 */
export function WizardProgress({ current, total, onPick, labels }: { current: number; total: number; onPick?: (n: number) => void; labels?: string[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted">{current > total ? t("wizard.reviewStep") : t("wizard.stepOf", { current, total })}</p>
      <ol className="flex gap-1.5" aria-label={t("wizard.progress")}>
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const done = n < current;
          const here = n === current;
          const cls = cn("h-2.5 w-full rounded-full transition-colors", done ? "bg-brand" : here ? "bg-brand/60" : "bg-stone-200");
          return (
            <li key={n} className="flex-1">
              {onPick ? (
                <button
                  type="button"
                  className="flex min-h-6 w-full items-center"
                  aria-current={here ? "step" : undefined}
                  aria-label={labels?.[i] ?? t("wizard.stepOf", { current: n, total })}
                  onClick={() => onPick(n)}
                >
                  <span className={cls} />
                </button>
              ) : (
                <span className={cn(cls, "block")} aria-current={here ? "step" : undefined} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Sticky action bar for Back / Save & finish later / Next (above the phone bottom bar). */
export function WizardActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-4">
      {children}
    </div>
  );
}

export function DoneMark({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full text-xs",
        on ? "bg-emerald-600 text-white" : "border border-dashed border-stone-300 text-stone-400",
      )}
      title={label}
      aria-label={label}
    >
      {on ? <Check className="size-4" aria-hidden /> : "–"}
    </span>
  );
}

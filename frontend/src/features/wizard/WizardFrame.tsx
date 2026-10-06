import type { ComponentType, ReactNode } from "react";
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
    <div className="space-y-1">
      <p className="tabular text-sm font-medium text-ink-muted">{current > total ? t("wizard.reviewStep") : t("wizard.stepOf", { current, total })}</p>
      <ol className="flex gap-1.5" aria-label={t("wizard.progress")}>
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const done = n < current;
          const here = n === current;
          // Block dots, no numbers dressed as scores: done = brand-soft with a brand edge, here = brand, upcoming = an outline.
          const cls = cn(
            "h-3 w-full rounded-[4px] transition-colors",
            done ? "border-2 border-brand bg-brand-soft" : here ? "bg-brand" : "border-2 border-line-strong",
          );
          return (
            <li key={n} className="flex-1">
              {onPick ? (
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center"
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

/**
 * The step's head on one band: icon tile, title and intro at the start, the progress at the
 * end from lg (stacked above on phones and tablets), so the form starts high on every screen.
 */
export function WizardHeader({
  icon: Icon,
  tile = "bg-tray",
  title,
  intro,
  progress,
}: {
  icon: ComponentType<{ className?: string }>;
  tile?: string;
  title: ReactNode;
  intro?: ReactNode;
  progress: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse lg:items-end lg:justify-between lg:gap-8">
      <div className="lg:w-80 lg:shrink-0">{progress}</div>
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-md md:size-12", tile)} aria-hidden>
          <Icon className="size-6 md:size-7" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-title md:text-display-lg font-semibold text-ink">{title}</h1>
          {intro && <p className="text-sm text-ink-muted md:text-base">{intro}</p>}
        </div>
      </div>
    </div>
  );
}

/** Sticky action bar for Back / Save & finish later / Next (above the phone bottom bar). */
export function WizardActions({ children }: { children: ReactNode }) {
  return (
    // Phones and tablets: in the flow under the questions (pages fit the screen, so it is always
    // visible and never covers a question or the bottom bar). Desktop: floating at the bottom.
    <div className="z-10 flex flex-nowrap items-center justify-between gap-2 rounded-lg border border-line bg-surface p-2 shadow-sheet sm:p-3 lg:sticky lg:bottom-4">
      {children}
    </div>
  );
}

/** "Save and finish later": the label on tablets and up, an icon button with the same name on phones. */
export function SaveLaterLabel({ label }: { label: string }) {
  return <span className="max-sm:sr-only">{label}</span>;
}

export function DoneMark({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-sm text-sm",
        on ? "bg-success text-on-brand" : "border-[1.5px] border-dashed border-line-strong text-ink-muted",
      )}
      title={label}
      aria-label={label}
    >
      {on ? <Check className="size-4" aria-hidden /> : "–"}
    </span>
  );
}

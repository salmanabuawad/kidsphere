import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Card (spec 6.5): `surface`, a 1px `line` border in both themes, radius-lg. Static
 * cards have no lip; for a whole-card link or button add `cardTappable`.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)} {...props} />;
}

/** A tappable card: lip at rest, rises on hover, sinks when pressed. */
export const cardTappable =
  "ks-press shadow-lip hover:-translate-y-px hover:shadow-lip-lg active:translate-y-0.5 active:shadow-none";

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Leading icon, e.g. a painted <NoteQuoteIcon />: shown in a 32px tray tile. */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 md:px-5", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-tray text-ink [&_svg]:size-5" aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-title font-semibold text-ink">{title}</h2>
          {description && <p className="text-caption mt-0.5 text-ink-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-4 md:px-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 md:px-5", className)} {...props} />;
}

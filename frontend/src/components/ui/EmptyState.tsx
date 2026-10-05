import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Friendly empty state: an icon in a soft circle, a title, a hint and one obvious action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-10 text-center", className)}>
      {icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-brand-soft text-2xl text-brand [&_svg]:size-6" aria-hidden>
          {icon}
        </div>
      )}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

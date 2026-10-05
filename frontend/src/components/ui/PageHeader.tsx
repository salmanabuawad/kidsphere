import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";

/**
 * Page title row. `back` renders a direction-aware back link
 * (the chevron flips in RTL via rtl:rotate-180).
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  eyebrow?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-6 space-y-2">
      {back && (
        <Link to={back.to} className="-ms-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm text-muted hover:text-ink">
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand [&_svg]:size-5" aria-hidden>
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <div className="mb-0.5 text-sm text-muted">{eyebrow}</div>}
            <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-[1.7rem]" dir="auto">
              {title}
            </h1>
            {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function SectionTitle({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

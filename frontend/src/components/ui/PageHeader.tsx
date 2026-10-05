import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";

/** Direction-aware back link: the chevron mirrors under RTL (scaleX, never rotate). */
export function BackLink({ to, label, className }: { to: string; label: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`-ms-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink ${className ?? ""}`}
    >
      <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
      {label}
    </Link>
  );
}

/**
 * Page title row: the title in the display face (display-lg). `icon` sits in a 48px
 * tray block (a painted custom icon reads best at 28px); `back` renders a BackLink.
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
    <div className="mb-6 space-y-2 md:mb-8">
      {back && <BackLink to={back.to} label={back.label} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-tray text-ink [&_svg]:size-7" aria-hidden>
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <div className="mb-0.5 text-sm text-ink-muted">{eyebrow}</div>}
            {/* bdi isolates the title's own direction while the heading still aligns to the page's start. */}
            <h1 className="font-display text-display-lg font-semibold text-ink">
              <bdi>{title}</bdi>
            </h1>
            {description && <p className="mt-1 max-w-2xl text-base text-ink-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A small section label inside a page (label style, muted). */
export function SectionTitle({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-muted [&_svg]:size-5">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

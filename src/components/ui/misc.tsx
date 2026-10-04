import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn, initials } from "@/lib/utils";

export function Avatar({ name, color, size = "md", className }: { name: string; color?: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const s = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-24 text-3xl" }[size];
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", s, className)}
      style={{ backgroundColor: color ?? "#a8a29e" }}
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 space-y-2">
      {back && (
        <Link href={back.href} className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="text-muted mb-1 text-sm">{eyebrow}</div>}
          <h1 className="text-ink text-2xl font-semibold tracking-tight md:text-[1.7rem]">{title}</h1>
          {description && <p className="text-muted mt-1 max-w-2xl text-sm">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function TabNav({ tabs, active }: { tabs: { href: string; label: string; key: string; count?: number }[]; active: string }) {
  return (
    <nav className="border-line -mx-1 mb-6 flex gap-1 overflow-x-auto border-b px-1" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            t.key === active ? "border-brand text-brand" : "text-muted hover:text-ink border-transparent",
          )}
        >
          {t.label}
          {!!t.count && <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Stat({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      <div className="text-muted flex items-center gap-2 text-sm">
        {icon}
        {label}
      </div>
      <div className="text-ink mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-muted mt-0.5 text-xs">{hint}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-line bg-card overflow-x-auto rounded-2xl border", className)}>
      <table className="[&_th]:text-muted [&_tr]:border-line w-full text-start text-sm [&_tbody_tr:last-child]:border-0 [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-start [&_th]:text-xs [&_th]:font-medium [&_th]:tracking-wide [&_th]:uppercase [&_thead]:bg-stone-50 [&_tr]:border-b">
        {children}
      </table>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">{children}</h2>
      {action}
    </div>
  );
}

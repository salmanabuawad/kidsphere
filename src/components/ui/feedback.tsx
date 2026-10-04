import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

/** Calm, non-alarming notices. "warning" uses amber, never red, for normal educational needs. */
export function Alert({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: "info" | "success" | "warning" | "error" | "tip";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const styles = {
    info: ["bg-sky-50 border-sky-200 text-sky-900", Info],
    success: ["bg-emerald-50 border-emerald-200 text-emerald-900", CheckCircle2],
    warning: ["bg-amber-50 border-amber-200 text-amber-900", AlertCircle],
    error: ["bg-rose-50 border-rose-200 text-rose-900", AlertCircle],
    tip: ["bg-violet-50 border-violet-200 text-violet-900", Lightbulb],
  } as const;
  const [cls, Icon] = styles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

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
    <div className={cn("border-line flex flex-col items-center rounded-2xl border border-dashed bg-white/60 px-6 py-10 text-center", className)}>
      {icon && <div className="text-muted mb-3 text-3xl">{icon}</div>}
      <p className="text-ink font-medium">{title}</p>
      {description && <p className="text-muted mt-1 max-w-md text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-stone-200/70", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

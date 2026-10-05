import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

/** Calm notices. "warning" is amber, never red; "error" is only for system errors. */
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
    info: ["border-sky-200 bg-sky-50 text-sky-900", Info],
    success: ["border-emerald-200 bg-emerald-50 text-emerald-900", CheckCircle2],
    warning: ["border-amber-200 bg-amber-50 text-amber-900", AlertCircle],
    error: ["border-rose-200 bg-rose-50 text-rose-900", AlertCircle],
    tip: ["border-violet-200 bg-violet-50 text-violet-900", Lightbulb],
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

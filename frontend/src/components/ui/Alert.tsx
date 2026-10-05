import type { ReactNode } from "react";
import { Check, CircleAlert, Info, Lightbulb } from "lucide-react";
import { AttentionIcon } from "@/icons";
import { cn } from "@/lib/utils";

/**
 * Calm inline notices (spec 6.17). warning is tangerine "worth a look", never red;
 * error is only for system errors (a `surface` block with a `danger` border); success is
 * a bordered block with a check, never a helps tint. tip is a neutral nudge on `tray`.
 */
const STYLES = {
  info: { box: "bg-brand-soft", icon: <Info className="text-brand" aria-hidden /> },
  warning: { box: "bg-attention-soft", icon: <AttentionIcon className="text-ink" aria-hidden /> },
  success: { box: "border-[1.5px] border-success bg-surface", icon: <Check className="text-success" strokeWidth={2.5} aria-hidden /> },
  error: { box: "border-[1.5px] border-danger bg-surface", icon: <CircleAlert className="text-danger" aria-hidden /> },
  tip: { box: "bg-tray", icon: <Lightbulb className="text-ink-muted" aria-hidden /> },
} as const;

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
  const s = STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex flex-wrap items-start gap-3 rounded-md px-4 py-3 text-base text-ink sm:flex-nowrap", s.box, className)}
    >
      <span className="mt-0.5 flex shrink-0 [&_svg]:size-5" aria-hidden>
        {s.icon}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className={cn("font-semibold", tone === "error" && "text-danger")}>{title}</p>}
        {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

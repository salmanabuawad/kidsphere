import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Simple bordered table; cells align to the start edge in both directions. Rubik only, tabular numbers. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-line bg-surface", className)}>
      <table className="w-full text-start text-sm [&_tbody_tr:last-child]:border-0 [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-start [&_th]:text-caption [&_th]:font-medium [&_th]:text-ink-muted [&_thead]:bg-tray [&_tr]:border-b [&_tr]:border-line">
        {children}
      </table>
    </div>
  );
}

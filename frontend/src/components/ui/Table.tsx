import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Simple bordered table; cells align to the start edge in both directions. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-line bg-card", className)}>
      <table className="w-full text-start text-sm [&_tbody_tr:last-child]:border-0 [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-start [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted [&_thead]:bg-stone-50 [&_tr]:border-b [&_tr]:border-line">
        {children}
      </table>
    </div>
  );
}

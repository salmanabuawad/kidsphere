import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { NavLink } from "react-router";
import { cn } from "@/lib/utils";

export type TabItem = { key: string; label: ReactNode; icon?: ReactNode; count?: number };

const tabClass = (active: boolean) =>
  cn(
    "-mb-px flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors",
    active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink",
  );

function CountBubble({ count }: { count?: number }) {
  if (!count) return null;
  return <span className="tabular rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{count}</span>;
}

/**
 * Route tabs (e.g. the child's Profile / Timeline / Content / Development).
 * Each tab is a NavLink; `end` makes the first tab exact.
 */
export function TabNav({ tabs, label }: { tabs: (TabItem & { to: string; end?: boolean })[]; label?: string }) {
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1" aria-label={label}>
      {tabs.map((t) => (
        <NavLink key={t.key} to={t.to} end={t.end} className={({ isActive }) => tabClass(isActive)}>
          {t.icon}
          {t.label}
          <CountBubble count={t.count} />
        </NavLink>
      ))}
    </nav>
  );
}

/** In-page tabs with roving focus (arrow keys follow the reading direction). */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (key: string) => void;
  label?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent, i: number) {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const fwd = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let next = -1;
    if (e.key === fwd) next = (i + 1) % tabs.length;
    else if (e.key === back) next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next]!.key);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className={cn("-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1", className)}>
      {tabs.map((t, i) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={tabClass(active)}
          >
            {t.icon}
            {t.label}
            <CountBubble count={t.count} />
          </button>
        );
      })}
    </div>
  );
}

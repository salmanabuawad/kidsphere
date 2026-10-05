import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { NavLink } from "react-router";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabItem = { key: string; label: ReactNode; icon?: ReactNode; count?: number };

/*
 * Tabs (spec 6.19) are built like the support scale: a `tray` track with blocks in it.
 * The selected tab is a raised `surface` block with a 2px brand border and a lip, and a
 * brand Check always leads its label (before any icon, whose designated primitive is
 * then "coloured in"). Border, lip and Check are the non-colour cues.
 * The track scrolls, so it clips at its 4px padding: the ring sits at a 1px offset to fit.
 */
const trackClass =
  "mb-6 flex snap-x gap-1 overflow-x-auto rounded-md bg-tray p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const tabClass = (active: boolean) =>
  cn(
    "flex min-h-11 shrink-0 snap-start items-center justify-center gap-2 rounded-md px-3.5 text-sm transition-colors focus-visible:outline-offset-1 sm:flex-1 [&_svg]:size-5",
    active
      ? "border-2 border-brand bg-surface px-[12px] font-semibold text-ink shadow-lip"
      : "font-medium text-ink-muted hover:text-ink [--icon-paint:transparent]",
  );

function Lead({ icon, active }: { icon?: ReactNode; active: boolean }) {
  return (
    <>
      {active && <Check className="size-4 shrink-0 text-brand" strokeWidth={2.5} aria-hidden />}
      {icon}
    </>
  );
}

function CountBubble({ count }: { count?: number }) {
  if (!count) return null;
  return <span className="tabular text-caption min-w-5 rounded-sm bg-attention-soft px-1.5 text-center font-medium text-ink">{count}</span>;
}

/**
 * Route tabs (e.g. the child's Profile / Timeline / Content / Development).
 * Each tab is a NavLink; `end` makes the first tab exact.
 */
export function TabNav({ tabs, label }: { tabs: (TabItem & { to: string; end?: boolean })[]; label?: string }) {
  return (
    <nav className={trackClass} aria-label={label}>
      {tabs.map((t) => (
        <NavLink key={t.key} to={t.to} end={t.end} className={({ isActive }) => tabClass(isActive)}>
          {({ isActive }) => (
            <>
              <Lead icon={t.icon} active={isActive} />
              {t.label}
              <CountBubble count={t.count} />
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** In-page tabs with roving focus (arrow keys follow the reading direction; Home/End jump). */
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
    <div role="tablist" aria-label={label} className={cn(trackClass, "mb-5", className)}>
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
            <Lead icon={t.icon} active={active} />
            {t.label}
            <CountBubble count={t.count} />
          </button>
        );
      })}
    </div>
  );
}

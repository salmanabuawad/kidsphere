import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { contentDir, usePlayerText, type Dir } from "./content-locale";

export type PresentFrameProps = {
  /** Content language (direction and the exit label). */
  lang: AppLocale;
  dir?: Dir;
  /** Called after the exit button is held down (or activated from the keyboard). */
  onExit?: () => void;
  /** How long the exit button must be held, in ms (default 1200). */
  holdMs?: number;
  children: ReactNode;
};

/**
 * Full-screen, distraction-free frame for presenting content to a child on a
 * tablet. Leaving is an adult action: press and hold the small exit button
 * (a quick tap by a child does nothing). Keyboard users press Enter/Space.
 */
export function PresentFrame({ lang, dir: dirProp, onExit, holdMs = 1200, children }: PresentFrameProps) {
  const t = usePlayerText(lang);
  const dir = contentDir(lang, dirProp);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = () => {
    cancel();
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onExit?.();
    }, holdMs);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div dir={dir} lang={lang} className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface text-ink" data-testid="present-frame">
      {onExit && (
        <div className="flex justify-end px-3 pt-3">
          <button
            type="button"
            onPointerDown={start}
            onPointerUp={cancel}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onExit();
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={t("player.present.exit")}
            title={t("player.present.holdToExit")}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-full bg-white/70 px-4 text-sm text-stone-500 ring-1 ring-stone-200 transition select-none",
              holding && "bg-stone-200 text-stone-800",
            )}
            data-testid="present-exit"
          >
            <X className="size-4" aria-hidden />
            {t("player.present.holdToExit")}
          </button>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 md:px-8">{children}</div>
    </div>
  );
}

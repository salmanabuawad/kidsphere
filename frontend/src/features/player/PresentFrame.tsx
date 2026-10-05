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
    <div dir={dir} lang={lang} className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ground text-ink" data-testid="present-frame">
      {onExit && (
        <div className="flex justify-end px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
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
              "inline-flex h-11 items-center gap-1.5 rounded-md border-[1.5px] border-line-strong bg-surface px-4 text-sm font-medium text-ink-muted transition-colors select-none",
              holding && "bg-tray text-ink",
            )}
            data-testid="present-exit"
          >
            <X className="size-4" aria-hidden />
            {t("player.present.holdToExit")}
          </button>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-[960px] flex-1 flex-col p-6 md:p-12">{children}</div>
    </div>
  );
}

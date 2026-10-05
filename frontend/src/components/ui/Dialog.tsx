import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/**
 * Accessible modal on native <dialog> (spec 6.15): focus trap, Escape and inert
 * background come from the platform; direction follows <html dir>.
 * md and up: a centred `surface-raised` panel (radius-lg, shadow-sheet).
 * Below md: a bottom sheet with radius-xl top corners and a grabber, rising in 220ms.
 * The backdrop is flat (no blur). Footer actions sit at the end, primary last.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  const width = { sm: "md:max-w-[480px]", md: "md:max-w-[640px]", lg: "md:max-w-3xl", xl: "md:max-w-4xl" }[size];
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-modal="true"
      aria-labelledby={titleId}
      className={cn(
        "animate-sheet mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-full rounded-ss-xl rounded-se-xl bg-surface-raised p-0 text-ink shadow-sheet",
        "md:animate-dialog md:m-auto md:w-[calc(100%-2rem)] md:rounded-lg",
        width,
      )}
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 md:px-6 md:pt-6">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-title font-semibold text-ink">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              title={t("common.close")}
              className="-me-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-tray hover:text-ink"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-6 md:pb-6">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 md:pb-5">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

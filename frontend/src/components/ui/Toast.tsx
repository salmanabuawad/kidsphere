import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "warning" | "info";
type ToastItem = { id: number; message: string; tone: ToastTone };
type Listener = (t: ToastItem) => void;

const listeners = new Set<Listener>();
let counter = 0;
const AUTO_DISMISS_MS = 5000;

/** Fire-and-forget toast from anywhere: toast(t("account.saved")); toast(msg, "error"). */
export function toast(message: string, tone: ToastTone = "success") {
  const item = { id: ++counter, message, tone };
  listeners.forEach((l) => l(item));
}

/** The leading 28px glyph block: a paint (graphite glyph), or `danger` for errors. */
const GLYPH: Record<ToastTone, { box: string; Icon: typeof Check }> = {
  success: { box: "bg-paint-leaf text-on-paint", Icon: Check },
  warning: { box: "bg-paint-tangerine text-on-paint", Icon: CircleAlert },
  info: { box: "bg-paint-sky text-on-paint", Icon: Info },
  error: { box: "bg-danger text-on-brand", Icon: CircleAlert },
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const { t } = useI18n();
  const [paused, setPaused] = useState(false);
  const left = useRef(AUTO_DISMISS_MS);
  const sticky = item.tone === "error";

  // Auto-dismiss after 5s (errors stay until closed); the timer pauses on hover and focus.
  useEffect(() => {
    if (sticky || paused) return;
    const started = Date.now();
    const timer = setTimeout(() => onDismiss(item.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(0, left.current - (Date.now() - started));
    };
  }, [sticky, paused, item.id, onDismiss]);

  const { box, Icon } = GLYPH[item.tone];
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="animate-placed pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-md bg-ink py-3 ps-3 pe-2 text-base font-semibold text-ground shadow-sheet"
    >
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-sm", box)} aria-hidden>
        <Icon className="size-[18px]" strokeWidth={2.5} />
      </span>
      <span dir="auto" className="min-w-0 flex-1">
        {item.message}
      </span>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label={t("common.close")}
        title={t("common.close")}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ground opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-ground"
      >
        <X className="size-5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Mounted once in App (spec 6.16): an `ink` block with `ground` text. Phones: centred,
 * just above the bottom bar. lg and up: bottom inline-end.
 */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const l: Listener = (t) => setItems((prev) => [...prev.slice(-2), t]);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const [dismiss] = useState(() => (id: number) => setItems((prev) => prev.filter((x) => x.id !== id)));
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:start-auto lg:end-6 lg:bottom-6 lg:items-end lg:px-0"
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}

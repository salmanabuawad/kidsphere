import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error";
type ToastItem = { id: number; message: string; tone: ToastTone };
type Listener = (t: ToastItem) => void;

const listeners = new Set<Listener>();
let counter = 0;

/** Fire-and-forget toast from anywhere: toast(t("account.saved")); toast(msg, "error"). */
export function toast(message: string, tone: ToastTone = "success") {
  const item = { id: ++counter, message, tone };
  listeners.forEach((l) => l(item));
}

/** Mounted once in App. Top on phones (clear of the bottom bar), bottom on desktop. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const l: Listener = (t) => {
      setItems((prev) => [...prev.slice(-2), t]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 4500);
      timers.add(timer);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
      timers.forEach(clearTimeout);
    };
  }, []);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 lg:top-auto lg:bottom-6"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cn(
            "animate-pop pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl px-4 py-3 text-sm text-white shadow-lg",
            t.tone === "success" ? "bg-stone-900" : "bg-rose-700",
          )}
        >
          {t.tone === "success" ? <CheckCircle2 className="size-4 shrink-0" aria-hidden /> : <AlertCircle className="size-4 shrink-0" aria-hidden />}
          <span dir="auto">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

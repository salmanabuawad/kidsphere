"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastItem = { id: number; message: string; tone: "success" | "error" };
type Listener = (t: ToastItem) => void;

const listeners = new Set<Listener>();
let counter = 0;

/** Fire-and-forget toast from any client component. */
export function toast(message: string, tone: ToastItem["tone"] = "success") {
  const item = { id: ++counter, message, tone };
  listeners.forEach((l) => l(item));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const l: Listener = (t) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4000);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-pop pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg",
            t.tone === "success" ? "bg-stone-900" : "bg-rose-700",
          )}
        >
          {t.tone === "success" ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

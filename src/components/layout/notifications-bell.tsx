"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { formatRelativeDays } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/translate";

type Notification = { id: string; type: string; title: string; link: string | null; readAt: string | null; createdAt: string };

const TITLE_KEYS: Record<string, MessageKey> = {
  questionnaire_submitted: "teacher.dashboard.newQuestionnaire",
  parent_message: "teacher.parentInsight.messages",
};

export function NotificationsBell() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Notification[]>("/api/notifications")
      .then(setItems)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = items.filter((n) => !n.readAt).length;

  async function markRead() {
    await api("/api/notifications", { method: "POST" }).catch(() => undefined);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("common.notifications")}
        aria-expanded={open}
        className="text-muted relative rounded-lg p-2 hover:bg-stone-100"
      >
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-amber-500" aria-hidden />}
      </button>
      {open && (
        <div className="animate-pop border-line absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border bg-white shadow-xl">
          <div className="border-line flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">{t("common.notifications")}</p>
            {unread > 0 && (
              <button onClick={markRead} className="text-brand text-xs hover:underline">
                {t("common.markAllRead")}
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && <li className="text-muted px-4 py-6 text-center text-sm">{t("common.noNotifications")}</li>}
            {items.map((n) => (
              <li key={n.id} className="border-line border-b last:border-0">
                <Link href={n.link ?? "#"} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 text-sm hover:bg-stone-50">
                  {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" aria-hidden />}
                  <span className="flex-1">
                    {TITLE_KEYS[n.type] ? t(TITLE_KEYS[n.type]!) : n.title}
                    <span className="text-muted block text-xs">{formatRelativeDays(n.createdAt, locale)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

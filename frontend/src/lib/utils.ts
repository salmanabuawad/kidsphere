import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge that knows the KidSphere theme (index.css): without this it would read
 * `text-caption` as a text colour and drop it next to `text-ink-muted`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display-xl", "display-lg", "title", "kid-label", "kid-story", "name", "caption"],
      shadow: ["lip", "lip-lg", "lip-brand", "lip-brand-pressed", "sheet"],
      animate: ["placed", "sheet", "dialog", "bounce-place", "stamp", "wiggle", "nudge"],
    },
  },
});

/** Merge Tailwind classes (later wins). Use logical utilities only: ms/me/ps/pe/start/end. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Up to two initials; works for Arabic and Hebrew names too. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => Array.from(p)[0]!.toLocaleUpperCase())
    .join("");
}

/** Parse "YYYY-MM-DD" as a local calendar date (no timezone shift); other strings via Date. */
export function toDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(d);
}

/** A client-side id for idempotent POSTs (client_request_id). */
export function requestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

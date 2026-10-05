import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

const AVATAR_COLORS = ["#0f766e", "#0369a1", "#7c3aed", "#b45309", "#be185d", "#4d7c0f", "#c2410c", "#0e7490"];

/** Stable, calm avatar colour for a name or id. */
export function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
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

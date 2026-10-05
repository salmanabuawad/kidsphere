/**
 * Quick observations (WP-08 backend):
 *   GET  /api/children/{id}/observations?focus_area_id&limit&offset → {observations, limit, offset, has_more}
 *   POST /api/children/{id}/observations → 201 {observation} (200 for a repeated client_request_id)
 *   PUT  /api/observations/{id} → {observation}
 */
import { api } from "@/lib/api";

export type SupportLevel = "independent" | "some_support" | "significant_support" | "not_observed";
/** The three quick buttons (not_observed is never offered in the quick form). */
export const QUICK_SUPPORT: SupportLevel[] = ["independent", "some_support", "significant_support"];

export type HelpItem = { key: string; custom?: undefined } | { custom: string; key?: undefined };
export type DidItChange = "yes" | "partly" | "no";
export type ObservationDetails = Partial<{
  what_i_see: string;
  when: string;
  what_needed: string;
  what_we_did: string;
  did_it_change: DidItChange;
}>;
export const DETAIL_TEXT_FIELDS = ["what_i_see", "when", "what_needed", "what_we_did"] as const;

export type Observation = {
  id: string;
  child_id: string;
  source: "quick" | "content_feedback";
  observed_at: string;
  focus_area_id: string | null;
  focus_area_title: string | null;
  content_id: string | null;
  content_title: string | null;
  result: string | null;
  area: string | null;
  context: string | null;
  observation: string | null;
  support_level: SupportLevel | null;
  what_helped: HelpItem[] | null;
  note: string | null;
  details: ObservationDetails | null;
  created_by: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
};

export type ObservationInput = {
  observation: string;
  observed_at?: string;
  focus_area_id?: string;
  area?: string;
  context?: string;
  support_level?: SupportLevel;
  /** what_helps keys, or {custom} for free text. */
  what_helped?: (string | { custom: string })[];
  note?: string;
  details?: ObservationDetails;
  client_request_id?: string;
};

export const observationsUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/observations`;

export function createObservation(childId: string, body: ObservationInput) {
  return api<{ observation: Observation }>(observationsUrl(childId), { method: "POST", body });
}

/** A fresh id per form; reused on retries so a double tap never saves twice. */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `obs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Children this device observed most recently (a per-device convenience for the /observe picker). */
const RECENT_KEY = "ks_recent_observed";
const RECENT_MAX = 5;

export function recentChildIds(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberChild(id: string) {
  try {
    const next = [id, ...recentChildIds().filter((v) => v !== id)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

/** "2026-10-05T09:30" for <input type="datetime-local"> in the device's time zone. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Quick and structured observations (WP-08, WP2-TO backend):
 *   GET  /api/children/{id}/observations?date_from&date_to&focus_area_id&domain&context&source&limit&offset
 *        → {observations, limit, offset, has_more}  (newest first)
 *   POST /api/children/{id}/observations → 201 {observation} (200 for a repeated client_request_id)
 *   PUT  /api/observations/{id} → {observation}
 *   GET  /api/observations/{id}/versions → {observation_id, versions: [record version]} (oldest first)
 */
import { api } from "@/lib/api";

export type SupportLevel = "independent" | "some_support" | "significant_support" | "not_observed";
/** The three quick buttons (not_observed is never offered in the quick form). */
export const QUICK_SUPPORT: SupportLevel[] = ["independent", "some_support", "significant_support"];

/** The 12 AI domains (`ai_domains`): observations.domains, history filters, AI data minimisation. */
export const AI_DOMAINS = [
  "emotional",
  "social",
  "communication",
  "language",
  "executive_function",
  "play",
  "gross_motor",
  "fine_motor",
  "independence",
  "sensory",
  "cognitive",
  "daily_routine",
] as const;
export type AiDomain = (typeof AI_DOMAINS)[number];
export const isAiDomain = (v: unknown): v is AiDomain => typeof v === "string" && (AI_DOMAINS as readonly string[]).includes(v);

/**
 * "What to look for next" (AI SUGGESTED observation question) handed to the quick-observation
 * form in router state: shown as a reminder; its area is pre-selected.
 */
export type LookFor = { question: string; domain?: string | null };
export const isLookFor = (v: unknown): v is LookFor =>
  typeof v === "object" && v !== null && typeof (v as LookFor).question === "string" && (v as LookFor).question.trim().length > 0;

/** Stage C chips of the observation model (all `what_helps` keys), in source order. */
export const STAGE_C_HELPS = [
  "adult_mediation",
  "reduced_stimulation",
  "short_instruction",
  "visual_support",
  "movement",
  "positive_reinforcement",
  "advance_preparation",
] as const;

export const INTENSITIES = ["light", "moderate", "strong"] as const;
export type Intensity = (typeof INTENSITIES)[number];

export type HelpItem = { key: string; custom?: undefined } | { custom: string; key?: undefined };
export type DidItChange = "yes" | "partly" | "no";

/** Stage B: when does it happen? */
export type WhenDetail = Partial<{
  time: string;
  /** observation_contexts key */
  activity: string;
  activity_text: string;
  with_whom: string;
  before_event: string;
  after_event: string;
}>;

/** The observation model's stages A–E (D14) plus the older free-text keys. */
export type ObservationDetails = Partial<{
  what_i_see: string;
  /** Older observations only (free text); new ones use when_detail. */
  when: string;
  when_detail: WhenDetail;
  /** Older observations only; new ones use needs. */
  what_needed: string;
  needs: { helps?: HelpItem[]; text?: string };
  what_we_did: string;
  plan_ref: { focus_area_id: string; version_seq?: number };
  did_it_change: DidItChange;
  what_changed: string;
  documentation: string;
}>;
export const DETAIL_TEXT_FIELDS = ["what_i_see", "when", "what_needed", "what_we_did"] as const;

/** How often / how long / how strongly: descriptive, never a score. */
export type ObservationAttributes = Partial<{ frequency: string; duration_minutes: number; intensity: Intensity }>;

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
  /** AI domains; older rows may not have the field. */
  domains?: AiDomain[];
  attributes?: ObservationAttributes | null;
  /** Saved versions in record_versions (1 = never edited; 0 for content feedback). */
  version_count?: number;
  created_by: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
};

/** Input form of a help chip: a what_helps key or {custom}. */
export type HelpInput = string | { custom: string } | { key: string };

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
  domains?: AiDomain[];
  attributes?: ObservationAttributes;
  details?: Omit<ObservationDetails, "needs"> & { needs?: { helps?: HelpInput[]; text?: string } };
  client_request_id?: string;
};

/** PUT /api/observations/{id}: only the fields sent change; null clears a field (never the text). */
export type ObservationUpdate = { [K in keyof Omit<ObservationInput, "client_request_id" | "observation">]?: ObservationInput[K] | null } & {
  observation?: string;
};

/** The URL filters of the Observations tab and GET /api/children/{id}/observations. */
export type ObservationFilters = Partial<{
  date_from: string;
  date_to: string;
  focus_area_id: string;
  domain: AiDomain;
  context: string;
  source: "quick" | "content_feedback";
  /** Stage E of a quick observation. */
  did_it_change: "yes" | "partly" | "no";
  /** content_results key of activity feedback. */
  result: string;
  limit: number;
  offset: number;
}>;

export type ObservationList = { observations: Observation[]; limit: number; offset: number; has_more: boolean };

/** One saved state of an observation (app.services.history.version_out). */
export type ObservationVersion = {
  id: number;
  seq: number;
  data: Partial<Observation> & Record<string, unknown>;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_role: string | null;
  via: string;
  created_at: string;
};

export const observationsUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/observations`;
export const observationUrl = (observationId: string) => `/api/observations/${encodeURIComponent(observationId)}`;
export const observationVersionsUrl = (observationId: string) => `${observationUrl(observationId)}/versions`;

export function createObservation(childId: string, body: ObservationInput) {
  return api<{ observation: Observation }>(observationsUrl(childId), { method: "POST", body });
}

export function updateObservation(observationId: string, body: ObservationUpdate) {
  return api<{ observation: Observation }>(observationUrl(observationId), { method: "PUT", body });
}

export function listObservations(childId: string, filters: ObservationFilters = {}, init: { signal?: AbortSignal } = {}) {
  return api<ObservationList>(observationsUrl(childId), { query: filters, signal: init.signal });
}

export function observationVersions(observationId: string) {
  return api<{ observation_id: string; versions: ObservationVersion[] }>(observationVersionsUrl(observationId));
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

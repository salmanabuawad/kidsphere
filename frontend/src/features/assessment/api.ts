/**
 * Teacher full observation (WP2-TO backend, COVERAGE-MATRIX §4.2):
 *   GET   /api/children/{id}/teacher-assessments → {current: Assessment | null, earlier: CycleSummary[]}
 *   POST  /api/children/{id}/teacher-assessments {kind?, filled_on?, period_*?, teacher_id?, filled_by_text?, copy_forward?}
 *         → 201 {assessment} (409 ASSESSMENT_OPEN)
 *   GET   /api/teacher-assessments/{aid} → {assessment}
 *   PATCH /api/teacher-assessments/{aid} → {assessment} (409 ASSESSMENT_CLOSED)
 *   PUT   /api/teacher-assessments/{aid}/domains/{d} {status, data} → DomainSaved (appends an entry)
 *   GET   /api/teacher-assessments/{aid}/domains/{d}/history → {entries: Entry[]} newest first
 *   POST  /api/teacher-assessments/{aid}/close → {assessment}
 *   POST  /api/teacher-assessments/{aid}/apply {list, domain, items} → {list, items, added}
 *   POST  /api/teacher-assessments/{aid}/needs/{i}/focus {title?, category?} → 201 {focus_area} (409 FOCUS_LIMIT)
 */
import type { SectionStatus } from "@/components/source";
import { api } from "@/lib/api";

/** The 13 teacher-observation sections (D1–D13), in source order (`observation_domains`). */
export const DOMAINS = [
  "emotional",
  "social",
  "language",
  "executive_function",
  "play",
  "gross_motor",
  "fine_motor",
  "independence",
  "sensory",
  "cognitive",
  "daily_routine",
  "strengths",
  "priority_needs",
] as const;
export type Domain = (typeof DOMAINS)[number];
/** Domains made of indicator rows on the support scale (+ domain fields). */
export const ITEM_DOMAINS: readonly Domain[] = ["emotional", "social", "language", "executive_function", "play", "gross_motor", "fine_motor", "cognitive"];
export const LEVELS = ["independent", "some_support", "significant_support", "not_observed"] as const;
export type Level = (typeof LEVELS)[number];
export const MAX_NEEDS = 3;
export const MAX_STRENGTHS = 5;

export type Choice = { key?: string; custom?: string };
export type ItemRating = { level?: Level; note?: string; seen_in?: string; observation_ids?: string[] };
export type SensoryRating = { effect?: string; reaction_text?: string; helps?: Choice[] };
export type HelpsText = { helps?: Choice[]; text?: string };
export type ChoicesText = { items?: Choice[]; text?: string };
export type DayStage = { succeeds?: string; difficult?: string; support_needed?: HelpsText; what_helps?: HelpsText; observation_ids?: string[] };
export type StrengthSlot = { list?: "strengths" | "interests"; key?: string; custom?: string; note?: string; observation_ids?: string[] };
export type Need = {
  area: string;
  seeing?: string;
  how_often?: string;
  situations?: { contexts?: string[]; text?: string };
  what_seems_harder?: string;
  already_tried?: string;
  what_helped?: HelpsText;
  focus_area_id?: string;
};
export type AttentionContext = { context: string; approx_minutes?: number; note?: string };
export type CarriedFrom = { assessment_id: string; entry_id?: string | null; filled_on?: string | null };

/** One domain document (COVERAGE-MATRIX §3.3.5); the keys used depend on the domain. */
export type DomainData = {
  items?: Record<string, ItemRating | SensoryRating> | StrengthSlot[];
  fields?: Record<string, unknown>;
  strengths_here?: Choice[];
  stages?: Record<string, DayStage>;
  needs?: Need[];
  carried_from?: CarriedFrom;
};

export type DomainState = {
  status: SectionStatus;
  data: DomainData;
  entry_id: string | null;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  provenance: string[];
};

export type ChildSnapshot = Partial<{
  name: string;
  preferred_name: string | null;
  birth_date: string;
  age_at_fill: { years: number; months: number };
  class_id: string | null;
  class_name: string | null;
  kindergarten: string | null;
  teacher_name: string | null;
}>;

export type NeedFocusArea = { index: number; area: string; focus_area_id: string; title: string; status: string };

export type Assessment = {
  id: string;
  child_id: string;
  kind: "initial" | "reassessment";
  number: number | null;
  previous_id: string | null;
  status: "open" | "closed";
  filled_on: string;
  period_from: string | null;
  period_to: string | null;
  period_note: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  filled_by_text: string | null;
  child_snapshot: ChildSnapshot;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  closed_by: string | null;
  closed_by_name: string | null;
  closed_at: string | null;
  domains: Partial<Record<Domain, DomainState>>;
  need_focus_areas: NeedFocusArea[];
};

export type CycleSummary = Pick<Assessment, "id" | "kind" | "number" | "status" | "filled_on" | "period_from" | "period_to" | "closed_at">;
export type CyclesResponse = { current: Assessment | null; earlier: CycleSummary[] };

export type Warning = { code: "wording" | "strengths_below_3" | string; path: string; message: string };
export type DomainSaved = {
  domain: Domain;
  status: SectionStatus;
  data: DomainData;
  entry_id: string;
  updated_at: string;
  updated_by_name: string;
  provenance: string[];
  warnings: Warning[];
};

export type Entry = {
  id: string;
  assessment_id: string;
  domain: Domain;
  status: SectionStatus;
  data: DomainData;
  entered_by: string | null;
  entered_by_name: string | null;
  entered_role: string;
  entered_at: string;
  provenance: string[];
};

export type HeaderInput = Partial<{
  filled_on: string;
  period_from: string | null;
  period_to: string | null;
  period_note: string | null;
  filled_by_text: string | null;
  teacher_id: string | null;
}>;

export type ApplyList = "strengths" | "interests" | "what_helps";
export type ApplyItem = { key?: string; custom?: string; list?: string };

const seg = encodeURIComponent;
export const cyclesUrl = (childId: string) => `/api/children/${seg(childId)}/teacher-assessments`;
export const assessmentUrl = (aid: string) => `/api/teacher-assessments/${seg(aid)}`;
export const historyUrl = (aid: string, domain: Domain) => `${assessmentUrl(aid)}/domains/${domain}/history`;

export function startCycle(childId: string, body: HeaderInput & { copy_forward?: boolean; kind?: Assessment["kind"] }) {
  return api<{ assessment: Assessment }>(cyclesUrl(childId), { method: "POST", body });
}

export function updateHeader(aid: string, body: HeaderInput) {
  return api<{ assessment: Assessment }>(assessmentUrl(aid), { method: "PATCH", body });
}

export function saveDomain(aid: string, domain: Domain, status: SectionStatus, data: DomainData) {
  return api<DomainSaved>(`${assessmentUrl(aid)}/domains/${domain}`, { method: "PUT", body: { status, data } });
}

export function closeCycle(aid: string) {
  return api<{ assessment: Assessment }>(`${assessmentUrl(aid)}/close`, { method: "POST" });
}

export function applyToProfile(aid: string, list: ApplyList, domain: Domain, items: ApplyItem[]) {
  return api<{ list: ApplyList; items: unknown[]; added: number }>(`${assessmentUrl(aid)}/apply`, { method: "POST", body: { list, domain, items } });
}

export function needToFocus(aid: string, index: number, body: { title?: string; category?: string } = {}) {
  return api<{ focus_area: { id: string; title: string } }>(`${assessmentUrl(aid)}/needs/${index}/focus`, { method: "POST", body });
}

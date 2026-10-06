/**
 * Plan tab = the goals of the short plan (Domain 15; goals are Current Focus areas). Backend (WP2-PLAN):
 *   GET  /api/children/{id}/focus-areas[?status&assessment_id] → FocusList (goals + plan context)
 *   POST /api/children/{id}/focus-areas → 201 {focus_area}   (409 FOCUS_LIMIT when 3 are active)
 *   PUT  /api/focus-areas/{id} {title?, description?, plan?, status?, follow_up_on?, assessment_id?} → {focus_area}
 *   POST /api/focus-areas/{id}/close {status: paused|completed, close_reason?} → {focus_area}
 *   GET  /api/focus-areas/{id}/versions → {focus_area, versions, status_changes}  (every change is kept)
 *   POST /api/teacher-assessments/{aid}/needs/{i}/focus → 201 {focus_area}   (WP2-TO: a Domain 13 need becomes a goal)
 */
import { api } from "@/lib/api";
import type { ProvenanceEntry } from "@/components/source";

export type FocusStatus = "active" | "paused" | "completed";

/** Strength → Need → Adaptation → What we will do (+ how often, who) → How we will know it helps. `review_on` is legacy text. */
export type FocusPlan = Partial<
  Record<"strength_used" | "need" | "adaptation" | "what_we_will_do" | "frequency" | "who" | "review_on" | "success_looks_like", string>
>;

export type FocusArea = {
  id: string;
  child_id: string;
  category: string;
  suggestion_key: string | null;
  title: string;
  description: string | null;
  plan: FocusPlan | null;
  /** YYYY-MM-DD: when we will look at this goal again (the 6th plan column). */
  follow_up_on?: string | null;
  /** The plan period: the teacher-observation cycle the goal belongs to. */
  assessment_id?: string | null;
  source_need?: { assessment_id?: string; index?: number } | null;
  status: FocusStatus;
  close_reason: string | null;
  created_at: string;
  updated_at?: string | null;
  closed_at?: string | null;
};

export type Period = {
  id: string;
  kind: "initial" | "reassessment";
  filled_on: string | null;
  period_from: string | null;
  period_to: string | null;
  status: "open" | "closed";
  closed_at: string | null;
};

export type FamilyHopes = {
  develop: { area: string; label: string | null; text: string | null }[];
  categories: string[];
  hope_child_feels: string[];
  hope_other: string | null;
  note: string | null;
  provenance: ProvenanceEntry[];
};

export type NeedCandidate = {
  assessment_id: string;
  assessment_status?: string;
  index: number;
  area: string;
  seeing: string | null;
  how_often: string | null;
  focus_area_id: string | null;
  provenance: ProvenanceEntry[];
};

export type FocusList = {
  focus_areas: FocusArea[];
  max_active: number;
  active_count?: number;
  open_assessment_id?: string | null;
  periods?: Period[];
  family_hopes?: FamilyHopes | null;
  need_candidates?: NeedCandidate[];
};

export type GoalVersion = {
  id: number;
  seq: number;
  data: Partial<FocusArea> & Record<string, unknown>;
  changed_by_name: string | null;
  changed_role: string | null;
  via: string;
  review_id: string | null;
  created_at: string | null;
};

export type StatusChange = {
  seq: number;
  status: FocusStatus;
  previous: FocusStatus | null;
  at: string | null;
  close_reason: string | null;
  changed_by_name: string | null;
  via: string;
  review_id: string | null;
};

export type GoalHistory = { focus_area: FocusArea; versions: GoalVersion[]; status_changes: StatusChange[] };

/** A strength or interest of the child, offered as a chip for "Strength we build on". */
export type StrengthOption = { list: string; key: string | null; custom: string | null };

export const MAX_ACTIVE = 3;
/** "Choose 2–3 goals for this period": guidance below this many active goals. */
export const MIN_SUGGESTED = 2;
/** The 6 plan columns of Domain 15: goal, method, frequency, responsible, success indicator, follow-up date. */
export const PLAN_COLUMNS = ["title", "what_we_will_do", "frequency", "who", "success_looks_like", "follow_up_on"] as const;
export type PlanColumn = (typeof PLAN_COLUMNS)[number];
/** Why this plan: Strength → Need → Adaptation (PLAN-ADJUSTMENTS B1). */
export const WHY_STEPS = ["strength_used", "need", "adaptation"] as const;

export const focusListUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/focus-areas`;
const focusUrl = (id: string) => `/api/focus-areas/${encodeURIComponent(id)}`;
export const focusVersionsUrl = (id: string) => `${focusUrl(id)}/versions`;

export type FocusCreateInput = {
  category?: string;
  suggestion_key?: string;
  title?: string;
  description?: string;
  plan?: FocusPlan;
  follow_up_on?: string | null;
};
export type FocusUpdateInput = Partial<{
  title: string;
  description: string | null;
  plan: FocusPlan | null;
  status: FocusStatus;
  follow_up_on: string | null;
}>;

export function createFocus(childId: string, body: FocusCreateInput) {
  return api<{ focus_area: FocusArea }>(focusListUrl(childId), { method: "POST", body });
}

export function updateFocus(id: string, body: FocusUpdateInput) {
  return api<{ focus_area: FocusArea }>(focusUrl(id), { method: "PUT", body });
}

export function closeFocus(id: string, status: "paused" | "completed") {
  return api<{ focus_area: FocusArea }>(`${focusUrl(id)}/close`, { method: "POST", body: { status } });
}

/** A Domain 13 need of the teacher observation becomes a goal (WP2-TO endpoint). */
export function promoteNeed(assessmentId: string, index: number) {
  return api<{ focus_area: FocusArea }>(`/api/teacher-assessments/${encodeURIComponent(assessmentId)}/needs/${index}/focus`, {
    method: "POST",
    body: {},
  });
}

/** A YYYY-MM-DD date as a local date (no time-zone shift when it is formatted). */
export function localDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
}

/** Today as YYYY-MM-DD in local time. */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Plan fields that changed between two versions of a goal (names only; for the history). */
export function changedFields(prev: GoalVersion["data"] | null, next: GoalVersion["data"]): string[] {
  if (!prev) return [];
  const out: string[] = [];
  for (const k of ["title", "description", "category", "status", "close_reason", "follow_up_on", "assessment_id"] as const) {
    if ((prev[k] ?? null) !== (next[k] ?? null)) out.push(k);
  }
  const a = (prev.plan ?? {}) as Record<string, unknown>;
  const b = (next.plan ?? {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if ((a[k] ?? null) !== (b[k] ?? null)) out.push(`plan.${k}`);
  return out;
}

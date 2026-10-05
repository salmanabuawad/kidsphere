/**
 * Development reviews (WP-12 backend) and the baseline endpoints the Development tab reads (WP-06):
 *
 *   GET  /api/children/{id}/development-reviews          → {reviews, context}
 *   POST /api/children/{id}/development-reviews/suggest  {language?} → Suggestion & DraftContext (writes nothing)
 *   POST /api/children/{id}/development-reviews          ReviewInput → 201 {review, current_understanding, warnings}
 *   GET  /api/children/{id}/current-understanding        → {current_understanding, baseline}
 *   GET  /api/children/{id}/baseline                     → {latest, earlier}
 *   POST /api/children/{id}/baseline                     → 201 {baseline}   ("Create new baseline", always a new row)
 *
 * Counts are plain numbers of observations; the UI only ever puts them into words (spec §26).
 */
import { api } from "@/lib/api";
import type { FocusPlan, ProfileItem } from "@/features/children";

export const REVIEW_STATUSES = ["improving", "some_improvement", "no_clear_change", "needs_more_observation", "no_longer_needed"] as const;
export const DECISIONS = ["keep", "pause", "close", "edit"] as const;
export const VALIDATION_STATUSES = ["supported", "partially_supported", "needs_more_observation", "may_need_refinement"] as const;
export const NEEDS_MORE = "needs_more_observation";
/** B6: a status other than "needs more observation" wants at least this many linked observations. */
export const MIN_OBSERVATIONS = 3;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type Decision = (typeof DECISIONS)[number] | "create";
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];
export type BaselineList = "strengths" | "interests" | "what_helps" | "support_needs" | "focus";
export type UnderstandingList = "strengths" | "interests" | "what_helps";

export type UserRef = { id: string; name: string | null };
export type Item = { key?: string | null; custom?: string | null; list?: string | null };

export type BaselineItem = { list: BaselineList; key: string | null; custom: string | null; label: string };

export type DraftFocus = {
  id: string;
  category: string;
  suggestion_key: string | null;
  title: string;
  description: string | null;
  plan: FocusPlan | null;
  status: string;
  created_at: string | null;
  observation_count: number;
};

export type DraftContext = {
  /** `summary`: the first-picture wording of the baseline (not stored in the snapshot itself). */
  baseline: { id: string; created_at: string; summary?: string | null } | null;
  observation_count_since_baseline: number;
  max_active: number;
  focus_areas: DraftFocus[];
  baseline_items: BaselineItem[];
};

export type SuggestedItem = { key: string | null; custom: string | null; label: string; note?: string | null };

export type Suggestion = {
  summary: string;
  strengths: SuggestedItem[];
  interests: SuggestedItem[];
  what_helps: SuggestedItem[];
  areas_for_support: string[];
  adaptations: string;
  next_steps: string;
  baseline_validation: (BaselineItem & { status: ValidationStatus; note: string; observation_ids: string[] })[];
  focus_review: { focus_area_id: string; status: ReviewStatus; note: string }[];
};

export type SuggestResponse = DraftContext & { suggestion: Suggestion; provider: "claude" | "template"; is_template: boolean };

export type Understanding = {
  summary?: string | null;
  strengths?: ProfileItem[];
  interests?: ProfileItem[];
  what_helps?: ProfileItem[];
  areas_for_support?: string[];
  adaptations?: string | null;
  next_steps?: string | null;
};

export type CurrentUnderstanding = Understanding & {
  source?: "baseline" | "review";
  review_id?: string;
  review_date?: string;
  baseline_id?: string | null;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  created_at?: string;
};

export type FocusReviewEntry = {
  focus_area_id: string;
  title: string;
  status: ReviewStatus | null;
  decision: Decision;
  what_worked: string | null;
  what_to_change: string | null;
  note: string | null;
};

export type ValidationEntry = BaselineItem & { status: ValidationStatus; note: string | null; observation_ids: string[] };

export type Review = {
  id: string;
  child_id: string;
  review_date: string;
  summary: string;
  understanding: Understanding;
  focus_review: FocusReviewEntry[];
  baseline_validation: ValidationEntry[];
  ai_suggested: boolean;
  created_by: UserRef | null;
  created_at: string;
};

export type ReviewsResponse = { reviews: Review[]; context: DraftContext };

export type ReviewWarning = {
  code: "LIMITED_OBSERVATIONS";
  path: string;
  observation_count: number;
  focus_area_id?: string;
  title?: string;
  list?: BaselineList;
  key?: string | null;
  label?: string;
};

export type FocusCreateInput = { category?: string; suggestion_key?: string; title?: string; description?: string };

export type FocusReviewInput = {
  focus_area_id?: string;
  status?: ReviewStatus;
  decision: Decision;
  what_worked?: string;
  what_to_change?: string;
  note?: string;
  edit?: { title?: string; description?: string | null };
  create?: FocusCreateInput;
};

export type ReviewInput = {
  summary: string;
  understanding: {
    summary: string;
    strengths: Item[];
    interests: Item[];
    what_helps: Item[];
    areas_for_support: string[];
    adaptations: string | null;
    next_steps: string | null;
  };
  baseline_validation: { list: BaselineList; key?: string | null; custom?: string | null; label: string; status: ValidationStatus; note?: string | null; observation_ids: string[] }[];
  focus_review: FocusReviewInput[];
  ai_suggested: boolean;
};

export type SaveResponse = { review: Review; current_understanding: CurrentUnderstanding; warnings: ReviewWarning[] };

/** baseline_data.support_needs (WP-06). */
export type SupportNeeds = {
  independence?: { area: string; level: string; reported_by: string }[];
  sensitivities?: ProfileItem[];
  emotions?: Record<string, unknown>;
  parent_priorities?: { categories?: string[]; note?: string | null; hope_child_feels?: string[]; one_thing_to_know?: string | null };
};

export type BaselineSummary = {
  strengths: ProfileItem[];
  interests: ProfileItem[];
  what_helps: ProfileItem[];
  support_needs: SupportNeeds;
  focus_areas: { id: string; title: string; category: string }[];
};

export type CurrentUnderstandingResponse = {
  current_understanding: CurrentUnderstanding | null;
  baseline: { id: string; created_at: string; created_by: UserRef | null; summary: BaselineSummary } | null;
};

export type BaselineRef = { id: string; created_at: string; created_by: UserRef | null };
export type BaselinesResponse = { latest: (BaselineRef & { baseline_data: unknown }) | null; earlier: BaselineRef[] };

const child = (id: string) => `/api/children/${encodeURIComponent(id)}`;
export const reviewsUrl = (childId: string) => `${child(childId)}/development-reviews`;
export const currentUnderstandingUrl = (childId: string) => `${child(childId)}/current-understanding`;
export const baselinesUrl = (childId: string) => `${child(childId)}/baseline`;

export function suggestReview(childId: string, language: string) {
  return api<SuggestResponse>(`${reviewsUrl(childId)}/suggest`, { method: "POST", body: { language } });
}

export function saveReview(childId: string, body: ReviewInput) {
  return api<SaveResponse>(reviewsUrl(childId), { method: "POST", body });
}

export function createBaseline(childId: string) {
  return api<{ baseline: BaselineRef }>(baselinesUrl(childId), { method: "POST" });
}

/** Same identity rule as the backend: a key, else the case-folded custom text. */
export function itemId(it: Item): string {
  return it.key ? `k:${it.key}` : `c:${(it.custom ?? "").trim().toLowerCase()}`;
}

/** A baseline item is identified by its list plus its key (else its custom text / label). */
export function baselineItemId(it: { list: string; key?: string | null; custom?: string | null; label?: string }): string {
  return it.key ? `${it.list}|k:${it.key}` : `${it.list}|c:${(it.custom ?? it.label ?? "").trim().toLowerCase()}`;
}

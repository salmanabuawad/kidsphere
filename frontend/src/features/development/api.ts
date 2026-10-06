/**
 * Development reviews (WP-12 backend) and the baseline endpoints the Development tab reads (WP-06):
 *
 *   GET  /api/children/{id}/development-reviews          → {reviews, context}
 *   POST /api/children/{id}/development-reviews/suggest  {language?} → Suggestion & DraftContext & {suggestion_id, …}
 *        (stores only the AI suggestion; the Domain 16 follow-up is never suggested)
 *   POST /api/children/{id}/development-reviews          ReviewInput (+ follow_up, ai_suggestion_id) → 201 {review, current_understanding, warnings}
 *   GET  /api/children/{id}/current-understanding        → {current_understanding, baseline}
 *   GET  /api/children/{id}/baseline                     → {latest, earlier, original_id, count}
 *   GET  /api/children/{id}/baselines/{bid}              → {baseline: full, original, latest, number, summary}
 *   GET  /api/children/{id}/functional-summaries         → {latest_approved, drafts, history, ai_drafts}
 *   POST /api/children/{id}/functional-summaries         SummaryInput → 201 {summary}   (every save is a new row)
 *   POST /api/children/{id}/functional-summaries/suggest {language?} → {draft, suggestion_id, …}
 *   POST /api/functional-summaries/{sid}/approve          → {summary}   (409 SUMMARY_APPROVED the second time)
 *   POST /api/children/{id}/baseline                     → 201 {baseline}   ("Create new baseline", always a new row)
 *
 * Counts are plain numbers of observations; the UI only ever puts them into words (spec §26).
 */
import { api } from "@/lib/api";
import type { ProvenanceEntry } from "@/components/source";
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
  /** Stage E ("did anything change") of the observations linked to the focus or applying its plan,
   *  since the last review: dated items per result, never a count to compare. */
  changes?: StageEChanges;
};

export type StageEResult = "yes" | "partly" | "no";
export type StageEChanges = Record<StageEResult, { id: string; observed_at: string }[]>;

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

export type ObservationQuestion = { domain: string; question: string };

export type SuggestResponse = DraftContext & {
  suggestion: Suggestion;
  provider: "claude" | "template";
  is_template: boolean;
  /** The stored ai_suggestions row; send it back as `ai_suggestion_id` when saving the review. */
  suggestion_id?: string;
  possible_patterns?: string[];
  next_observation_questions?: ObservationQuestion[];
};

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
  /** Domain 16 (null when nothing was filled in). */
  follow_up?: FollowUp | null;
  ai_suggested: boolean;
  ai_suggestion_id?: string | null;
  provenance?: ProvenanceEntry[];
  created_by: UserRef | null;
  created_at: string;
};

export type ReviewsResponse = { reviews: Review[]; context: DraftContext };

export type ReviewWarning = {
  /** LIMITED_OBSERVATIONS: a status rests on few observations (B6). WORDING: the involvement note uses words to avoid (a warning only). */
  code: "LIMITED_OBSERVATIONS" | "WORDING";
  message?: string;
  path: string;
  observation_count?: number;
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
  /** Domain 16, only when something was filled in. Teacher-only: no suggestion fills it. */
  follow_up?: FollowUpInput;
  ai_suggested: boolean;
  ai_suggestion_id?: string;
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

type BaselineRefBase = { id: string; created_at: string; created_by: UserRef | null };
export type BaselineRef = BaselineRefBase & { original?: boolean };
export type BaselinesResponse = {
  latest: (BaselineRef & { baseline_data: unknown }) | null;
  earlier: BaselineRef[];
  /** The first baseline ever (X-12). */
  original_id?: string | null;
  count?: number;
};

const child = (id: string) => `/api/children/${encodeURIComponent(id)}`;
export const reviewsUrl = (childId: string) => `${child(childId)}/development-reviews`;
/** GET → {suggestions: [{id, kind, output, …}]}: the stored AI suggestions (staff only, newest first). */
export const aiSuggestionsUrl = (childId: string, kind?: "understanding" | "functional_summary") =>
  `${child(childId)}/ai-suggestions${kind ? `?kind=${kind}` : ""}`;
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

// --------------------------------------------------------------------------- Domain 16: review follow-up

export const IMPROVEMENT_LEVELS = ["significant", "partial", "no_change", "needs_more_observation"] as const;
export const INVOLVEMENT_STEPS = ["none", "consultation", "joint_plan", "referral_as_needed"] as const;
export type ImprovementLevel = (typeof IMPROVEMENT_LEVELS)[number];
export type InvolvementStep = (typeof INVOLVEMENT_STEPS)[number];

/** development_reviews.follow_up as stored (every field present, empty ones null). */
export type FollowUp = {
  reassessment_on: string | null;
  improvement: { level: ImprovementLevel | null; note: string | null };
  areas: { domains: string[]; focus_area_ids: string[]; text: string | null };
  what_worked: string | null;
  what_to_change: string | null;
  involvement: { key: InvolvementStep | null; note: string | null };
};

export type FollowUpInput = Partial<{
  reassessment_on: string;
  improvement: { level?: ImprovementLevel; note?: string };
  areas: { domains?: string[]; focus_area_ids?: string[]; text?: string };
  what_worked: string;
  what_to_change: string;
  involvement: { key?: InvolvementStep; note?: string };
}>;

// --------------------------------------------------------------------------- baselines (original vs latest)

export type BaselineDetail = BaselineRef & {
  child_id: string;
  baseline_data: BaselineData;
  original: boolean;
  latest: boolean;
  number: number;
  count: number;
  /** The first-picture summary, worded as when the baseline was created. */
  summary: string | null;
};

/** The parts of baseline_data the original-vs-latest viewer compares. */
export type BaselineData = {
  strengths?: ProfileItem[];
  interests?: ProfileItem[];
  what_helps?: ProfileItem[];
  focus_areas?: { id: string; title: string; category: string }[];
  support_needs?: SupportNeeds;
};

export const baselineUrl = (childId: string, baselineId: string) => `${child(childId)}/baselines/${encodeURIComponent(baselineId)}`;

// --------------------------------------------------------------------------- Domain 17: functional summary

export type SummaryItem = { key?: string | null; custom?: string | null };

export type SummaryFields = {
  general_description: string | null;
  main_strengths: { items: SummaryItem[]; text: string | null };
  main_needs: { items: string[]; text: string | null };
  adaptations: string | null;
  follow_up_with_parents: string | null;
  team_recommendations: string | null;
};

export type FunctionalSummary = SummaryFields & {
  id: string;
  child_id: string;
  supersedes_id: string | null;
  superseded_by: string | null;
  review_id: string | null;
  assessment_id: string | null;
  source: "manual" | "ai_draft";
  ai_suggestion_id: string | null;
  status: "draft" | "approved";
  approved_by: UserRef | null;
  approved_at: string | null;
  created_by: UserRef | null;
  created_at: string;
  provenance: ProvenanceEntry[];
};

export type SummariesResponse = {
  latest_approved: FunctionalSummary | null;
  drafts: FunctionalSummary[];
  history: FunctionalSummary[];
  /** The AI drafts the rows started from (by ai_suggestion_id), for "compare with the AI draft". */
  ai_drafts: Record<string, SummaryFields>;
};

export type SummaryInput = Partial<SummaryFields> & {
  supersedes_id?: string;
  source: "manual" | "ai_draft";
  ai_suggestion_id?: string;
};

export type SummarySuggestResponse = {
  draft: SummaryFields;
  suggestion_id: string;
  provider: "claude" | "template";
  is_template: boolean;
  possible_patterns: string[];
  next_observation_questions: ObservationQuestion[];
};

export const summariesUrl = (childId: string) => `${child(childId)}/functional-summaries`;

export function saveSummary(childId: string, body: SummaryInput) {
  return api<{ summary: FunctionalSummary }>(summariesUrl(childId), { method: "POST", body });
}

export function suggestSummary(childId: string, language: string) {
  return api<SummarySuggestResponse>(`${summariesUrl(childId)}/suggest`, { method: "POST", body: { language } });
}

export function approveSummary(summaryId: string) {
  return api<{ summary: FunctionalSummary }>(`/api/functional-summaries/${encodeURIComponent(summaryId)}/approve`, { method: "POST", body: {} });
}

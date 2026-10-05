/**
 * Shapes of /api/children (WP-05). Other features may import these via
 * "@/features/children".
 */
export type AgeParts = { years: number; months: number };
export type ClassRef = { id: string; name: string; kindergarten: string };

/** One row of GET /api/children. Staff-only fields are absent for parents. */
export type ChildCard = {
  id: string;
  name: string;
  preferred_name: string | null;
  birth_date: string;
  age: AgeParts;
  class: ClassRef | null;
  main_language: string;
  has_photo: boolean;
  updated_at: string | null;
  wizard_completed?: boolean;
  active_focus_count?: number;
  last_observation_at?: string | null;
  draft_content_count?: number;
  archived?: boolean;
  /** Merged strengths ({key|custom, sources}), so the card can lead with them (staff only). */
  strengths?: ProfileItem[];
};

/** GET /api/children → cards plus the classes this user may add children to (and filter by). */
export type ChildListResponse = { children: ChildCard[]; classes: ClassRef[] };

/** A merged profile item: an option key or a custom text, with where it came from. */
export type ProfileItem = {
  key?: string;
  custom?: string;
  sources?: string[];
  /** what_helps items: the option list the key belongs to (calming_helps, transition_helps, …). */
  list?: string;
  what_happens?: string;
  what_helps?: ProfileItem[];
};

/** Strength → Need → Adaptation → What we will do → Follow-up (PLAN-ADJUSTMENTS B1). */
export type FocusPlan = {
  strength_used?: string | null;
  need?: string | null;
  adaptation?: string | null;
  what_we_will_do?: string | null;
  frequency?: string | null;
  who?: string | null;
  review_on?: string | null;
  success_looks_like?: string | null;
};

export type FocusAreaSummary = {
  id: string;
  title: string;
  category: string;
  suggestion_key: string | null;
  description: string | null;
  plan: FocusPlan | null;
  created_at: string | null;
};

export type LatestObservation = {
  id: string;
  observed_at: string;
  observation: string;
  support_level: string | null;
  source: string;
  focus_area_id: string | null;
};

export type CurrentUnderstanding = { summary?: string | null; [k: string]: unknown };

/** GET/PUT /api/children/{id} → {child}. `view` tells which shape came back. */
export type ChildBasics = {
  id: string;
  name: string;
  preferred_name: string | null;
  birth_date: string;
  age: AgeParts;
  gender: string | null;
  class: ClassRef | null;
  main_language: string;
  additional_languages: string[];
  parent_name: string | null;
  parent_contact: string | null;
  has_photo: boolean;
  archived: boolean;
  updated_at: string | null;
  strengths: ProfileItem[];
  interests: ProfileItem[];
};

export type ChildParentView = ChildBasics & { view: "parent" };

export type ChildStaffView = ChildBasics & {
  view: "staff";
  what_helps: ProfileItem[];
  motivators: ProfileItem[];
  sensitivities: ProfileItem[];
  current_understanding: CurrentUnderstanding | null;
  focus_areas: FocusAreaSummary[];
  latest_observation: LatestObservation | null;
  last_observation_at: string | null;
  wizard: { step: number; completed_at: string | null };
  baseline: { exists: boolean; latest_created_at: string | null };
  draft_content_count: number;
};

export type ChildDetail = ChildParentView | ChildStaffView;

/** Editable basics (PUT /api/children/{id}); parents may send only preferred_name, additional_languages, parent_name, parent_contact. */
export type ChildBasicsInput = Partial<{
  name: string;
  preferred_name: string | null;
  birth_date: string;
  gender: string | null;
  class_id: string;
  main_language: string;
  additional_languages: string[];
  parent_name: string | null;
  parent_contact: string | null;
}>;

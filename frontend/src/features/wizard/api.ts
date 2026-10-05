/**
 * Wizard data: profile sections (GET/PATCH /api/children/{id}/profile),
 * focus areas and baselines (WP-06 backend), plus the WP-05 child endpoints
 * used by step 1.
 */
import { api } from "@/lib/api";

/** An option key or a custom free-text entry. */
export type Item = { key: string; custom?: undefined } | { custom: string; key?: undefined };
export type SensitivityItem = Item & { what_happens?: string; what_helps?: Item[] };

export type PerspectiveName = "parent" | "teacher";
export type SectionName = "who" | "emotions" | "social" | "independence" | "environment" | "priorities";
export type SectionData = Record<string, unknown>;

export type EnteredStamp = { by: string; by_name?: string; role: "admin" | "teacher" | "parent"; reported_by: PerspectiveName; at: string };

export type Perspective = {
  sections: Partial<Record<SectionName, SectionData>>;
  entered: Partial<Record<SectionName, EnteredStamp[]>>;
  wizard?: { step?: number; completed_at?: string | null };
};

export type MergedItem = {
  key?: string;
  custom?: string;
  list?: string;
  sources: string[];
  what_happens?: string | null;
  what_helps?: Item[];
};

export type WizardState = { step: number; completed_at: string | null };

export type ProfileResponse = {
  child_id: string;
  perspective: PerspectiveName;
  parent_perspective: Perspective;
  teacher_perspective?: Perspective;
  strengths?: MergedItem[];
  interests?: MergedItem[];
  motivators?: MergedItem[];
  what_helps?: MergedItem[];
  sensitivities?: MergedItem[];
  wizard: WizardState;
  has_baseline?: boolean;
};

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
  status: "active" | "paused" | "completed";
  close_reason: string | null;
  created_at: string;
};

export type ClassOption = { id: string; name: string; kindergarten?: string };

/** WP-05 child composite (only the fields the wizard reads). */
export type ChildBasics = {
  id: string;
  name: string;
  preferred_name: string | null;
  birth_date: string;
  gender: string | null;
  class?: ClassOption | null;
  class_id?: string | null;
  main_language: string;
  additional_languages: string[];
  parent_name: string | null;
  parent_contact: string | null;
  has_photo?: boolean;
};

export type ChildBasicsInput = {
  name: string;
  preferred_name?: string | null;
  birth_date: string;
  gender?: string | null;
  class_id?: string | null;
  main_language: string;
  additional_languages: string[];
  parent_name?: string | null;
  parent_contact?: string | null;
};

export const profileUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/profile`;
export const focusListUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/focus-areas`;
export const childUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}`;

export type ProfilePatch = {
  perspective?: PerspectiveName;
  section?: SectionName;
  data?: SectionData;
  wizard_step?: number;
  complete?: boolean;
};

export function patchProfile(childId: string, body: ProfilePatch) {
  return api<ProfileResponse>(profileUrl(childId), { method: "PATCH", body });
}

export function createFocus(childId: string, body: { category?: string; suggestion_key?: string; title?: string; description?: string; plan?: FocusPlan }) {
  return api<{ focus_area: FocusArea }>(focusListUrl(childId), { method: "POST", body });
}

export function updateFocus(id: string, body: Partial<Pick<FocusArea, "title" | "description" | "plan" | "category">>) {
  return api<{ focus_area: FocusArea }>(`/api/focus-areas/${encodeURIComponent(id)}`, { method: "PUT", body });
}

export function closeFocus(id: string, status: "paused" | "completed" = "paused") {
  return api<{ focus_area: FocusArea }>(`/api/focus-areas/${encodeURIComponent(id)}/close`, { method: "POST", body: { status } });
}

export function createBaseline(childId: string) {
  return api<{ baseline: { id: string } }>(`/api/children/${encodeURIComponent(childId)}/baseline`, { method: "POST" });
}

export function createChild(body: ChildBasicsInput) {
  return api<{ child: ChildBasics }>("/api/children", { method: "POST", body });
}

export function updateChild(childId: string, body: Partial<ChildBasicsInput>) {
  return api<{ child: ChildBasics }>(childUrl(childId), { method: "PUT", body });
}

export function uploadPhoto(childId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return api(`/api/children/${encodeURIComponent(childId)}/photo`, { method: "PUT", form });
}

/** Stable identity of an item: "k:<key>" or "c:<custom, lower-cased>". */
export function itemId(i: Item | MergedItem): string {
  return i.key ? `k:${i.key}` : `c:${(i.custom ?? "").trim().toLowerCase()}`;
}

/** Normalise stored values (plain keys or objects) to Item[]. */
export function asItems(v: unknown): Item[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): Item[] => {
    if (typeof x === "string") return [{ key: x }];
    if (x && typeof x === "object") {
      const o = x as { key?: unknown; custom?: unknown };
      if (typeof o.key === "string" && o.key) return [{ key: o.key }];
      if (typeof o.custom === "string" && o.custom) return [{ custom: o.custom }];
    }
    return [];
  });
}

export function asKeys(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function asSensitivities(v: unknown): SensitivityItem[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): SensitivityItem[] => {
    const [base] = asItems([x]);
    if (!base) return [];
    const o = x as { what_happens?: unknown; what_helps?: unknown };
    return [{ ...base, what_happens: typeof o.what_happens === "string" ? o.what_happens : undefined, what_helps: asItems(o.what_helps) }];
  });
}

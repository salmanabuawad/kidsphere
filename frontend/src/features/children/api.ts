import type { ChildCard, ChildDetail } from "./types";

/** Days without an observation after which a child shows in "Not observed recently". */
export const NOT_OBSERVED_DAYS = 14;
/** Wizard step that holds the review and "Create baseline" (7 steps + review; WP-06). */
export const WIZARD_REVIEW_STEP = 8;
/** Upload limit, mirrored from backend/app/services/uploads.py. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const childUrl = (id: string) => `/api/children/${encodeURIComponent(id)}`;
/** GET: both perspectives, the merged lists (with provenance[]) and the section statuses (staff). */
export const profileUrl = (id: string) => `${childUrl(id)}/profile`;
/** GET: the current teacher observation cycle and the earlier ones (WP2-TO). */
export const assessmentsUrl = (id: string) => `${childUrl(id)}/teacher-assessments`;

/** The photo endpoint; `version` (e.g. updated_at) changes the URL after an upload. */
export function photoUrl(id: string, version?: string | null): string {
  const base = `${childUrl(id)}/photo`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}

export function displayName(c: Pick<ChildCard, "name" | "preferred_name">): string {
  return c.preferred_name?.trim() || c.name;
}

/** True when the child has no observation in the last NOT_OBSERVED_DAYS days (or none at all). */
export function notObservedRecently(lastObservationAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastObservationAt) return true;
  const t = new Date(lastObservationAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= NOT_OBSERVED_DAYS * 86_400_000;
}

export function isStaffView(c: ChildDetail | undefined): c is Extract<ChildDetail, { view: "staff" }> {
  return !!c && c.view === "staff";
}

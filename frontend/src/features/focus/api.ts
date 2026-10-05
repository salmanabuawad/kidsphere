/**
 * Current Focus (WP-06 backend):
 *   GET  /api/children/{id}/focus-areas → {focus_areas, max_active}
 *   POST /api/children/{id}/focus-areas → 201 {focus_area}   (409 FOCUS_LIMIT when 3 are active)
 *   PUT  /api/focus-areas/{id} {title?, description?, plan?, status?} → {focus_area}
 *   POST /api/focus-areas/{id}/close {status: paused|completed} → {focus_area}
 */
import { api } from "@/lib/api";
import type { FocusArea as WizardFocusArea, FocusPlan } from "@/features/wizard/api";

export type { FocusPlan };
export type FocusStatus = "active" | "paused" | "completed";
export type FocusArea = WizardFocusArea & { closed_at?: string | null; updated_at?: string | null };
export type FocusList = { focus_areas: FocusArea[]; max_active: number };

export const MAX_ACTIVE = 3;
/** Strength used → Need → Adaptation → What we will do → Follow-up (PLAN-ADJUSTMENTS B1). */
export const PLAN_STEPS = ["strength_used", "need", "adaptation", "what_we_will_do", "success_looks_like"] as const;

export const focusListUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/focus-areas`;
const focusUrl = (id: string) => `/api/focus-areas/${encodeURIComponent(id)}`;

export type FocusCreateInput = { category?: string; suggestion_key?: string; title?: string; description?: string; plan?: FocusPlan };
export type FocusUpdateInput = Partial<{ title: string; description: string | null; plan: FocusPlan | null; status: FocusStatus }>;

export function createFocus(childId: string, body: FocusCreateInput) {
  return api<{ focus_area: FocusArea }>(focusListUrl(childId), { method: "POST", body });
}

export function updateFocus(id: string, body: FocusUpdateInput) {
  return api<{ focus_area: FocusArea }>(focusUrl(id), { method: "PUT", body });
}

export function closeFocus(id: string, status: "paused" | "completed") {
  return api<{ focus_area: FocusArea }>(`${focusUrl(id)}/close`, { method: "POST", body: { status } });
}

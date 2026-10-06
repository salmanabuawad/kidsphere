/**
 * The Observations tab (OB; COVERAGE-MATRIX §5.1, X-13, X-34) reads:
 *   GET /api/children/{id}/observations?date_from&date_to&focus_area_id&domain&context&source&limit&offset
 *       → {observations, limit, offset, has_more}   newest first
 *   GET /api/observations/{oid}/versions → {versions: [record_versions row]} (staff; WP2-TO)
 * Older backends may not send domains / attributes / version info yet: every field is optional.
 */

export type HelpItem = { key?: string; custom?: string };

/** One observation as listed (the quick-observation shape plus the 0002 additions). */
export type ObservationRow = {
  id: string;
  child_id?: string;
  source: "quick" | "content_feedback" | string;
  observed_at: string;
  focus_area_id: string | null;
  focus_area_title?: string | null;
  content_id?: string | null;
  content_title?: string | null;
  result?: string | null;
  area?: string | null;
  context?: string | null;
  observation: string | null;
  support_level?: string | null;
  what_helped?: HelpItem[] | null;
  note?: string | null;
  details?: Record<string, unknown> | null;
  domains?: string[] | null;
  attributes?: Record<string, unknown> | null;
  created_by?: { id: string; name: string } | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** Set by newer backends: whether the observation was edited / how many versions it has. */
  edited?: boolean;
  version_count?: number;
};

export type ObservationPage = { observations: ObservationRow[]; limit: number; offset: number; has_more: boolean };

/** One version (app.services.history.version_out). `data` is the full observation state after that save. */
export type ObservationVersion = {
  id: number | string;
  seq: number;
  data: Record<string, unknown>;
  changed_by_name?: string | null;
  changed_role?: string | null;
  via?: string | null;
  created_at?: string | null;
};

export const PAGE_SIZE = 30;

export const observationsUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/observations`;
export const versionsUrl = (observationId: string) => `/api/observations/${encodeURIComponent(observationId)}/versions`;

/** Accepts {versions:[…]} or a bare list; oldest first. */
export function normalizeVersions(raw: unknown): ObservationVersion[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { versions?: unknown } | null)?.versions) ? (raw as { versions: unknown[] }).versions : [];
  return list
    .filter((v): v is ObservationVersion => !!v && typeof v === "object" && typeof (v as ObservationVersion).seq === "number")
    .map((v) => ({ ...v, data: v.data && typeof v.data === "object" ? v.data : {} }))
    .sort((a, b) => a.seq - b.seq);
}

const EDIT_SLACK_MS = 2000;

/** "Edited" marker: the backend says so, or the row changed after it was created. */
export function isEdited(o: ObservationRow): boolean {
  if (typeof o.edited === "boolean") return o.edited;
  if (typeof o.version_count === "number") return o.version_count > 1;
  if (!o.created_at || !o.updated_at) return false;
  const created = Date.parse(o.created_at);
  const updated = Date.parse(o.updated_at);
  return Number.isFinite(created) && Number.isFinite(updated) && updated - created > EDIT_SLACK_MS;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

/** The observation as of one version (fields the row itself would have). */
export function rowFromVersion(id: string, v: ObservationVersion, base?: ObservationRow | null): ObservationRow {
  const d = v.data;
  return {
    ...(base ?? {}),
    id,
    source: str(d.source) ?? base?.source ?? "quick",
    observed_at: str(d.observed_at) ?? base?.observed_at ?? v.created_at ?? "",
    focus_area_id: str(d.focus_area_id) ?? base?.focus_area_id ?? null,
    observation: str(d.observation),
    support_level: str(d.support_level),
    context: str(d.context),
    area: str(d.area),
    note: str(d.note),
    details: d.details && typeof d.details === "object" ? (d.details as Record<string, unknown>) : null,
    what_helped: Array.isArray(d.what_helped) ? (d.what_helped as HelpItem[]) : null,
    domains: Array.isArray(d.domains) ? (d.domains as string[]) : (base?.domains ?? null),
    attributes: d.attributes && typeof d.attributes === "object" ? (d.attributes as Record<string, unknown>) : null,
  };
}

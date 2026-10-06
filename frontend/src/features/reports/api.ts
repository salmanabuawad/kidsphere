import { apiDownload, type ApiBlobInit } from "@/lib/api";
import type { AppLocale } from "@/i18n/config";

/**
 * PDF reports (COVERAGE-MATRIX §4.4, §5.9). Staff only; the PDF is rendered on the
 * server in memory and downloaded as a blob (no URL, no file path ever reaches us).
 *
 *   POST /api/children/{id}/reports/pdf  ReportRequest → application/pdf (attachment)
 *        errors: 400 VALIDATION, 404, 503 REPORT_BUSY, 500 REPORT_FAILED
 *   GET  /api/children/{id}/reports      → {exports: ExportRow[]} newest first (the export log)
 */
export const REPORT_TYPES = [
  "full",
  "parent_questionnaire",
  "teacher_observation",
  "current_development",
  "intervention_plan",
  "timeline",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const INCLUDE_FLAGS = [
  "include_parent",
  "include_teacher_observations",
  "include_timeline",
  "include_health",
  "include_family",
  "include_private_notes",
] as const;
export type IncludeFlag = (typeof INCLUDE_FLAGS)[number];
export type IncludeFlags = Record<IncludeFlag, boolean>;

/** Server defaults: the three content parts on, the three sensitive parts off. */
export const DEFAULT_FLAGS: IncludeFlags = {
  include_parent: true,
  include_teacher_observations: true,
  include_timeline: true,
  include_health: false,
  include_family: false,
  include_private_notes: false,
};

/** The sensitive parts: off by default, and every export that includes them is logged. */
export const SENSITIVE_FLAGS: readonly IncludeFlag[] = ["include_health", "include_family", "include_private_notes"];

/** Which include toggles shape each report (the others are sent with their defaults). */
export const FLAGS_BY_TYPE: Record<ReportType, readonly IncludeFlag[]> = {
  full: INCLUDE_FLAGS,
  parent_questionnaire: ["include_health", "include_family", "include_private_notes"],
  teacher_observation: ["include_private_notes"],
  current_development: [],
  intervention_plan: ["include_parent"],
  timeline: ["include_parent"],
};

/** Reports with a date range (Full: the observation history and timeline; R4: "recent" observations). */
export const RANGE_TYPES: ReadonlySet<ReportType> = new Set<ReportType>(["full", "timeline", "current_development"]);
/** Reports that print one teacher-observation cycle. */
export const CYCLE_TYPES: ReadonlySet<ReportType> = new Set<ReportType>(["teacher_observation", "intervention_plan"]);

export function isReportType(v: unknown): v is ReportType {
  return typeof v === "string" && (REPORT_TYPES as readonly string[]).includes(v);
}

export type ReportForm = {
  report_type: ReportType;
  language: AppLocale;
  date_from: string;
  date_to: string;
  assessment_id: string;
  flags: IncludeFlags;
};

export type ReportRequest = {
  report_type: ReportType;
  language: AppLocale;
  date_from?: string;
  date_to?: string;
  assessment_id?: string;
} & IncludeFlags;

/** The POST body: only the fields that apply to the chosen report; flags that do not apply keep their defaults. */
export function buildRequest(form: ReportForm): ReportRequest {
  const applies = new Set(FLAGS_BY_TYPE[form.report_type]);
  const flags = Object.fromEntries(INCLUDE_FLAGS.map((f) => [f, applies.has(f) ? form.flags[f] : DEFAULT_FLAGS[f]])) as IncludeFlags;
  const body: ReportRequest = { report_type: form.report_type, language: form.language, ...flags };
  if (RANGE_TYPES.has(form.report_type)) {
    if (form.date_from) body.date_from = form.date_from;
    if (form.date_to) body.date_to = form.date_to;
  }
  if (CYCLE_TYPES.has(form.report_type) && form.assessment_id) body.assessment_id = form.assessment_id;
  return body;
}

/** The date-range problem to show, or null. Dates are "YYYY-MM-DD" (compared as strings). */
export function rangeError(from: string, to: string, today: string): "order" | "future" | null {
  if ((from && from > today) || (to && to > today)) return "future";
  if (from && to && from > to) return "order";
  return null;
}

export const reportsUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/reports`;
export const pdfUrl = (childId: string) => `${reportsUrl(childId)}/pdf`;

export function fallbackFilename(type: ReportType): string {
  return `kidsphere-${type.replace(/_/g, "-")}.pdf`;
}

/** Downloads and saves the PDF; the object URL is revoked shortly after the click (or by `revoke`). */
export function exportPdf(childId: string, body: ReportRequest, init?: ApiBlobInit) {
  return apiDownload(pdfUrl(childId), body, fallbackFilename(body.report_type), init);
}

export type ExportRow = {
  id: string;
  report_type: ReportType;
  language: AppLocale;
  date_from: string | null;
  date_to: string | null;
  generated_at: string;
  generated_by: { id: string; name: string | null } | null;
  include_health: boolean;
  include_family: boolean;
  include_private_notes: boolean;
};
export type ExportLog = { exports: ExportRow[] };

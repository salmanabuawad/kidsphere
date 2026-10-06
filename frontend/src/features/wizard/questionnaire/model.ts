/**
 * The parent questionnaire (שאלון היכרות) as data: the registry from GET /api/source-model
 * (`parent_questionnaire`, backend/app/data/source/parent_questionnaire.json) drives the
 * 9-step wizard (PW1–PW9), the Parent View and the Quick Baseline summary. Every question
 * is a registry item: {id, section, step, kind, field, options, sensitivity, label, …}.
 * Answers live in `parent_perspective.sections.<data section>.<field>` (COVERAGE-MATRIX §3.3.1).
 */
import type { Localized } from "@/i18n/config";
import type { Registry, RegistryItem, RegistrySection } from "@/lib/sourceModel";

export const QUESTIONNAIRE = "parent_questionnaire";
export const FIRST_STEP = 1;
export const LAST_STEP = 9;
/** The "thank you / sent" page after PW9. */
export const DONE_STEP = 10;

export type SectionData = Record<string, unknown>;
export type EntryMode = "self" | "on_behalf" | "meeting";
export type StaffEntryMode = Exclude<EntryMode, "self">;

export type Stamp = {
  by: string;
  by_name?: string;
  role: "admin" | "teacher" | "parent";
  reported_by: "parent" | "teacher";
  at: string;
  mode?: EntryMode;
  version_seq?: number;
};

export type SectionStatusEntry = { status?: string; by?: string; by_name?: string; at?: string };

export type Meeting = { date?: string | null; attendees?: string[] };

/** parent_perspective.questionnaire (PQM). */
export type QuestionnaireRecord = {
  status?: "draft" | "submitted";
  filled_at?: string | null;
  submitted_at?: string | null;
  resubmitted_at?: string | null;
  submitted_by?: string | null;
  submitted_by_name?: string | null;
  school_year?: string | null;
  entry_mode?: EntryMode | null;
  meeting?: Meeting | null;
  migrated?: boolean;
};

export type PerspectiveDoc = {
  sections: Record<string, SectionData>;
  entered: Record<string, Stamp[]>;
  section_status?: Record<string, SectionStatusEntry>;
  wizard?: { step?: number; completed_at?: string | null };
  questionnaire?: QuestionnaireRecord;
};

export type ProvenanceBadgeData = { label: string; entered_by?: string; mode?: string };
export type MergedItem = { key?: string; custom?: string; list?: string; sources?: string[]; main?: boolean; provenance?: ProvenanceBadgeData[] };

/** GET/PATCH /api/children/{id}/profile (parents get only the parent perspective). */
export type QProfile = {
  child_id: string;
  perspective: "parent" | "teacher";
  parent_perspective: PerspectiveDoc;
  teacher_perspective?: PerspectiveDoc;
  questionnaire?: QuestionnaireRecord | null;
  section_status?: { parent: Record<string, SectionStatusEntry>; teacher: Record<string, SectionStatusEntry> };
  strengths?: MergedItem[];
  interests?: MergedItem[];
  what_helps?: MergedItem[];
  wizard: { step: number; completed_at: string | null };
  has_baseline?: boolean;
};

export type QuestionnairePatch = {
  filled_at?: string;
  school_year?: string;
  entry_mode?: EntryMode;
  meeting?: Meeting;
  submit?: boolean;
};

export type QPatch = {
  perspective?: "parent" | "teacher";
  section?: string;
  data?: SectionData;
  status?: string;
  questionnaire?: QuestionnairePatch;
  wizard_step?: number;
  complete?: boolean;
};

export type StepMeta = { step: number; sections: string[]; label: Localized };

/** One version from GET /api/children/{id}/profile/history. */
export type ProfileVersion = {
  id: number;
  seq: number;
  key: string;
  data: SectionData;
  changed_by_name: string | null;
  changed_role: string | null;
  reported_by: string | null;
  via: string;
  created_at: string;
  initial?: boolean;
};

export type ProfileHistory = {
  versions: ProfileVersion[];
  initial: Record<string, number>;
  submitted_at: string | null;
  questionnaire_status: string | null;
};

export type LegacyEntry = { field: string; kind: string; options?: string; replaced_by: string[]; label: Localized };

// ---- small readers for the registry's extra fields

export const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const fieldOf = (item: RegistryItem): string => str(item.field);
export const optionsOf = (item: RegistryItem): string => (typeof item.options === "string" ? item.options : "");
export const localized = (v: unknown): Localized | undefined => (v && typeof v === "object" ? (v as Localized) : undefined);
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Same rule as the backend's has_value(): text with content, a list or object with an answer inside. */
export function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(hasValue);
  if (isObj(v)) return Object.entries(v).some(([k, x]) => k !== "not_answered" && hasValue(x));
  return true;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!isObj(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function steps(reg: Registry | null): StepMeta[] {
  const raw = reg?.meta?.steps;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObj)
    .map((s) => ({ step: Number(s.step), sections: asStrings(s.sections), label: localized(s.label) ?? {} }))
    .filter((s) => Number.isInteger(s.step))
    .sort((a, b) => a.step - b.step);
}

/** The data section a registry section is stored in (section A "intro" → "who"). */
export function dataSection(section: RegistrySection | undefined): string {
  return str(section?.data_section) || section?.key || "";
}

export function parentSections(reg: Registry | null): RegistrySection[] {
  return (reg?.sections ?? []).filter((s) => s.kind === "parent");
}

const SKIPPED_KINDS = new Set(["display", "record"]);

/** The questions of one section shown on one step, in source order (parts are rendered inside their question). */
export function questions(reg: Registry | null, sectionKey: string, step?: number): RegistryItem[] {
  return (reg?.items ?? []).filter(
    (i) => i.section === sectionKey && !i.part_of && !SKIPPED_KINDS.has(i.kind) && (step === undefined || i.step === step),
  );
}

export function partsOf(reg: Registry | null, item: RegistryItem): RegistryItem[] {
  return (reg?.items ?? []).filter((i) => i.part_of === item.id);
}

/** Follow-up questions open only after "yes" (or "other"); an existing answer always shows. */
export function isShown(item: RegistryItem, data: SectionData): boolean {
  const cond = item.show_if;
  if (!isObj(cond)) return true;
  if (hasValue(data[fieldOf(item)])) return true;
  const value = getPath(data, str(cond.field));
  return asStrings(cond.in).includes(str(value));
}

export function isPrivate(item: RegistryItem | RegistrySection): boolean {
  return ["health", "medical", "family", "third_party"].includes(str(item.sensitivity)) || item.private === true;
}

export function legacyEntries(reg: Registry | null): LegacyEntry[] {
  const raw = reg?.meta?.legacy;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((e) => ({
    field: str(e.field),
    kind: str(e.kind),
    options: str(e.options) || undefined,
    replaced_by: asStrings(e.replaced_by),
    label: localized(e.label) ?? {},
  }));
}

/** Answers that exist only in the keys of the earlier form (shown as "From the earlier form"). */
export function earlierAnswers(reg: Registry | null, sections: Record<string, SectionData>, dataSectionKey: string) {
  return legacyEntries(reg).filter((e) => {
    const [sec, field] = e.field.split(".");
    if (sec !== dataSectionKey || !field) return false;
    if (!hasValue(sections[sec]?.[field])) return false;
    return !e.replaced_by.some((path) => {
      const [s, f] = path.split(".");
      return !!s && !!f && sections[s] !== undefined && f in (sections[s] ?? {});
    });
  });
}

export function lastStamp(doc: PerspectiveDoc | undefined, sections: string[]): Stamp | undefined {
  let best: Stamp | undefined;
  for (const s of sections) {
    const list = doc?.entered?.[s];
    const last = Array.isArray(list) ? list[list.length - 1] : undefined;
    if (last && (!best || String(last.at) > String(best.at))) best = last;
  }
  return best;
}

export function sectionStatus(doc: PerspectiveDoc | undefined, dataSectionKey: string): string | undefined {
  return doc?.section_status?.[dataSectionKey]?.status;
}

export function clampStep(n: number): number {
  if (!Number.isInteger(n) || n < FIRST_STEP) return FIRST_STEP;
  return Math.min(n, DONE_STEP);
}

export const profileUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/profile`;
export const historyUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/profile/history`;

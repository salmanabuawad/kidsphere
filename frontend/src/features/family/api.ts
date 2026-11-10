/**
 * Family programs (backend/app/routers/family.py, migration 0012): a weekly journey for families.
 *   GET  /api/family-programs, GET /api/family-programs/{id}            staff
 *   POST /api/admin/family-programs, PUT /api/admin/family-programs/{id} admin
 *   GET/POST /api/children/{id}/family-programs                         staff (POST), staff + parents (GET)
 *   PUT  /api/family-enrolments/{id} {status}                           staff
 *   POST /api/family-enrolments/{id}/reflections {week, result?, note?}  parent (result) / staff (note)
 * Program texts are {en, ar, he}; show them with pick(text, locale).
 */
import { api } from "@/lib/api";

export type Lang = Partial<Record<"en" | "ar" | "he", string>>;
export type WeekType = "story" | "home_activity" | "digital_game" | "real_world_activity" | "video";
export type ProgramWeek = { content_type: WeekType; topic: Lang; lesson: Lang; try_at_home: Lang; reflection: Lang };
export type ProgramStatus = "draft" | "published" | "archived";
export type Program = { id: string; title: Lang; description: Lang; weeks: ProgramWeek[]; status: ProgramStatus; updated_at?: string | null };
export type WeekResult = "worked_well" | "partly" | "did_not_work";
export type WeekReflection = { id: string; week: number; author_role: "parent" | "teacher"; result: WeekResult | null; note: string | null; created_at: string; by_name: string | null };
export type Enrolment = {
  id: string;
  child_id: string;
  status: "active" | "completed" | "stopped";
  started_on: string;
  current_week: number;
  weeks_count: number;
  program: Program;
  reflections: WeekReflection[];
  shared_content: { id: string; title: string; content_type: string; approved_at: string | null }[];
  can_edit: boolean;
};


const enc = encodeURIComponent;
export const programsUrl = "/api/family-programs";
export const enrolmentsUrl = (childId: string) => `/api/children/${enc(childId)}/family-programs`;

export const enrol = (childId: string, programId: string, startedOn?: string) =>
  api<{ enrolment: Enrolment }>(enrolmentsUrl(childId), { method: "POST", body: { program_id: programId, ...(startedOn ? { started_on: startedOn } : {}) } });
export const setEnrolmentStatus = (id: string, status: Enrolment["status"]) =>
  api<{ enrolment: Enrolment }>(`/api/family-enrolments/${enc(id)}`, { method: "PUT", body: { status } });
export const addReflection = (id: string, body: { week: number; result?: WeekResult; note?: string | null }) =>
  api<{ enrolment: Enrolment }>(`/api/family-enrolments/${enc(id)}/reflections`, { method: "POST", body });
export const createProgram = (body: Omit<Program, "id" | "updated_at">) =>
  api<{ program: Program }>("/api/admin/family-programs", { method: "POST", body });
export const updateProgram = (id: string, body: Partial<Omit<Program, "id" | "updated_at">>) =>
  api<{ program: Program }>(`/api/admin/family-programs/${enc(id)}`, { method: "PUT", body });

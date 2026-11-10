/**
 * Class sessions (backend app/services/class_sessions.py): a group activity run with children of a
 * class, and a note per child that becomes an observation.
 *   GET  /api/class-sessions?class_id&library_item_id → {sessions}
 *   POST /api/class-sessions {class_id, library_item_id?, title?, held_on?, child_ids} → 201 {session}
 *   GET  /api/class-sessions/{id} → {session}
 *   PUT  /api/class-sessions/{id}/children {child_ids} → {session}
 *   PUT  /api/class-sessions/{id}/observations {entries: [{child_id, support_level?, observation?}]} → {session}
 */
import { api } from "@/lib/api";

const enc = encodeURIComponent;

export type SessionChild = {
  id: string;
  name: string;
  preferred_name: string | null;
  has_photo: boolean;
  updated_at: string | null;
  observation: {
    id: string;
    support_level: string | null;
    observation: string | null;
    focus_area_id: string | null;
    focus_area_title: string | null;
  } | null;
};

export type ClassSession = {
  id: string;
  class: { id: string; name: string };
  library_item: { id: string; title: string; content_type: string } | null;
  title: string;
  held_on: string;
  children_count: number;
  noted_count: number;
  created_by: { id: string; name: string | null } | null;
  created_at: string | null;
  children?: SessionChild[];
};

export type SessionResponse = { session: ClassSession };
export type SessionNote = { child_id: string; support_level: string | null; observation: string | null };

export const sessionsUrl = "/api/class-sessions";
export const sessionUrl = (id: string) => `${sessionsUrl}/${enc(id)}`;

export const createSession = (body: { class_id: string; library_item_id?: string | null; title?: string | null; held_on?: string; child_ids: string[] }) =>
  api<SessionResponse>(sessionsUrl, { method: "POST", body });
export const saveSessionNotes = (id: string, entries: SessionNote[]) =>
  api<SessionResponse>(`${sessionUrl(id)}/observations`, { method: "PUT", body: { entries } });

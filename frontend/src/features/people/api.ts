/**
 * People in the child's life (backend routers/people.py, services/people.py).
 *
 *   GET    /api/children/{id}/people → {people: Person[], max}          (anyone who may see the child)
 *   POST   /api/children/{id}/people {relation, display_name} → 201 {person}   (staff; 409 CONFLICT at the limit)
 *   PUT    /api/people/{pid} {relation?, display_name?} → {person}             (staff)
 *   DELETE /api/people/{pid}                                                    (staff; the photo goes too)
 *   PUT    /api/people/{pid}/photo (multipart "file") → {person}; DELETE …/photo (staff)
 *   GET    /api/people/{pid}/photo → the JPEG (served only after the access check)
 *
 * Stories, games and videos can include up to MAX_IN_CONTENT of them. The AI sees only a
 * placeholder and the relation; the name and the photo stay in KidSphere.
 */
import { personPhotoUrl } from "@/features/player";
import { api } from "@/lib/api";

export type Person = {
  id: string;
  child_id: string;
  relation: string;
  display_name: string;
  has_photo: boolean;
  updated_at: string | null;
};

export type PeopleResponse = { people: Person[]; max: number };

export const MAX_IN_CONTENT = 3;
export const MAX_NAME = 40;

const enc = encodeURIComponent;
export const peopleUrl = (childId: string) => `/api/children/${enc(childId)}/people`;
export const personUrl = (id: string) => `/api/people/${enc(id)}`;
export const photoOf = (p: Pick<Person, "id" | "has_photo" | "updated_at">) => (p.has_photo ? personPhotoUrl(p.id, p.updated_at) : null);

export const createPerson = (childId: string, body: { relation: string; display_name: string }) =>
  api<{ person: Person }>(peopleUrl(childId), { method: "POST", body });
export const updatePerson = (id: string, body: { relation?: string; display_name?: string }) =>
  api<{ person: Person }>(personUrl(id), { method: "PUT", body });
export const deletePerson = (id: string) => api<void>(personUrl(id), { method: "DELETE" });
export function uploadPersonPhoto(id: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return api<{ person: Person }>(`${personUrl(id)}/photo`, { method: "PUT", form });
}
export const deletePersonPhoto = (id: string) => api<void>(`${personUrl(id)}/photo`, { method: "DELETE" });

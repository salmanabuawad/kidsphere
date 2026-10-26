/**
 * Content library (backend app/services/library.py): ready-made content admins manage and staff
 * give to children as drafts.
 *   GET  /api/library → {collections} (published only)
 *   GET  /api/library/items/{id} → {item} (with content)
 *   POST /api/library/items/{id}/assign {child_ids, use_child_name} → 201 {content: ContentSummary[]}
 *   GET  /api/admin/library → {collections} (every status)
 *   POST /api/admin/library/collections, PUT …/{id} → {collection}
 *   POST /api/admin/library/items, PUT …/{id} → {item}   400 VALIDATION, 422 UNSAFE_CONTENT {issues}
 *   PUT/DELETE /api/admin/library/items/{id}/media/{slot} (multipart file), PUT …/details {alt, credit} → {media}
 */
import type { ContentSummary } from "@/features/content";
import type { MediaRef } from "@/features/player";
import { api } from "@/lib/api";

const enc = encodeURIComponent;

export type LibraryStatus = "draft" | "published" | "archived";
export type Audience = "child" | "group";

/** What an item builds: a focus_suggestions key or a custom text. */
export type Goal = { key: string } | { custom: string };
/** Which children it suits: a key of a profile list (SUITS_LISTS) or a custom text. */
export type Suit = { list: string; key: string } | { custom: string };
/** The profile lists whose keys describe the children an item suits (backend services/library.SUITS_LISTS). */
export const SUITS_LISTS = ["describe_words", "social", "communication", "frustration_reactions", "transition_reactions", "morning_separation"] as const;

export type LibraryItem = {
  id: string;
  collection_id: string;
  content_type: string;
  template: string | null;
  language: string;
  title: string;
  goal: string | null;
  /** The character's name in the texts; replaced by each child's name on assign (unless kept). */
  hero: string | null;
  audience: Audience;
  mode: string;
  target_strength: string | null;
  goals: Goal[];
  suits: Suit[];
  sort_order: number;
  status: LibraryStatus;
  updated_at: string | null;
  // detail only
  content?: Record<string, unknown>;
  media?: MediaRef[];
  media_slots?: string[];
};

export type LibraryCollection = {
  id: string;
  title: string;
  description: string | null;
  ages: string | null;
  sort_order: number;
  status: LibraryStatus;
  updated_at: string | null;
  items: LibraryItem[];
};

export type LibraryResponse = { collections: LibraryCollection[] };
export type ItemResponse = { item: LibraryItem };

export const libraryUrl = "/api/library";
export const libraryItemUrl = (id: string) => `/api/library/items/${enc(id)}`;
export const adminLibraryUrl = "/api/admin/library";

export const assignLibraryItem = (id: string, childIds: string[], useChildName: boolean) =>
  api<{ content: ContentSummary[] }>(`${libraryItemUrl(id)}/assign`, {
    method: "POST",
    body: { child_ids: childIds, use_child_name: useChildName },
  });

export type CollectionBody = { title?: string; description?: string | null; ages?: string | null; sort_order?: number; status?: LibraryStatus };
export const createCollection = (body: CollectionBody) =>
  api<{ collection: LibraryCollection }>(`${adminLibraryUrl}/collections`, { method: "POST", body });
export const updateCollection = (id: string, body: CollectionBody) =>
  api<{ collection: LibraryCollection }>(`${adminLibraryUrl}/collections/${enc(id)}`, { method: "PUT", body });

export type ItemBody = {
  collection_id?: string;
  content_type?: string;
  language?: string;
  content?: Record<string, unknown>;
  hero?: string | null;
  audience?: Audience;
  target_strength?: string | null;
  goals?: Goal[];
  suits?: Suit[];
  status?: LibraryStatus;
};
export const createItem = (body: ItemBody) => api<ItemResponse>(`${adminLibraryUrl}/items`, { method: "POST", body });
export const updateItem = (id: string, body: ItemBody) => api<ItemResponse>(`${adminLibraryUrl}/items/${enc(id)}`, { method: "PUT", body });

const mediaUrl = (id: string, slot: string) => `${adminLibraryUrl}/items/${enc(id)}/media/${enc(slot)}`;
export const uploadMedia = (id: string, slot: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api<{ media: MediaRef[] }>(mediaUrl(id, slot), { method: "PUT", form });
};
export const updateMediaDetails = (id: string, slot: string, body: { alt: string | null; credit: string | null }) =>
  api<{ media: MediaRef[] }>(`${mediaUrl(id, slot)}/details`, { method: "PUT", body });
export const removeMedia = (id: string, slot: string) => api<void>(mediaUrl(id, slot), { method: "DELETE" });

/**
 * Content library (backend app/services/library.py): ready-made content admins manage and staff
 * give to children as drafts.
 *   GET  /api/library → {collections} (published only)
 *   GET  /api/library/items/{id} → {item} (with content)
 *   POST /api/library/items/{id}/assign {child_ids, use_child_name} → 201 {content: ContentSummary[]}
 *   GET  /api/admin/library → {collections} (every status)
 *   POST /api/admin/library/collections, PUT …/{id} → {collection}
 *   POST /api/admin/library/items, PUT …/{id} → {item}   400 VALIDATION, 422 UNSAFE_CONTENT {issues}
 */
import type { ContentSummary } from "@/features/content";
import { api } from "@/lib/api";

const enc = encodeURIComponent;

export type LibraryStatus = "draft" | "published" | "archived";
export type Audience = "child" | "group";

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
  sort_order: number;
  status: LibraryStatus;
  updated_at: string | null;
  content?: Record<string, unknown>;
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
  status?: LibraryStatus;
};
export const createItem = (body: ItemBody) => api<ItemResponse>(`${adminLibraryUrl}/items`, { method: "POST", body });
export const updateItem = (id: string, body: ItemBody) => api<ItemResponse>(`${adminLibraryUrl}/items/${enc(id)}`, { method: "PUT", body });

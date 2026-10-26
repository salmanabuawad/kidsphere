/**
 * Content library (backend app/services/library.py): ready-made content staff assign to children.
 *   GET  /api/library → {collections, items}
 *   GET  /api/library/{key} → {item} (with content)
 *   POST /api/library/{key}/assign {child_ids, use_child_name} → 201 {content: ContentSummary[]} (a draft per child)
 */
import type { ContentSummary } from "@/features/content";
import { api } from "@/lib/api";

const enc = encodeURIComponent;

export type LibraryCollection = { key: string; title: string; ages: string | null };

export type LibraryItem = {
  key: string;
  collection: string;
  content_type: string;
  template: string | null;
  language: string;
  title: string;
  goal: string | null;
  /** The character's name in the texts; replaced by each child's name on assign (unless kept). */
  hero: string;
  content?: Record<string, unknown>;
};

export type LibraryResponse = { collections: LibraryCollection[]; items: LibraryItem[] };

export const libraryUrl = "/api/library";
export const libraryItemUrl = (key: string) => `/api/library/${enc(key)}`;

export const assignLibraryItem = (key: string, childIds: string[], useChildName: boolean) =>
  api<{ content: ContentSummary[] }>(`${libraryItemUrl(key)}/assign`, {
    method: "POST",
    body: { child_ids: childIds, use_child_name: useChildName },
  });

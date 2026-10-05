/**
 * Defensive readers for the child and content payloads the parent pages use.
 * GET /api/children (WP-05) and GET /api/children/{id}/content (WP-11) are owned
 * by other packages, so a few equivalent shapes are accepted.
 */
export type ProfileItem = string | { key?: string | null; custom?: string | null; label?: string | null };

export type ParentChild = {
  id: string;
  name: string;
  preferred_name?: string | null;
  birth_date?: string | null;
  age?: { years: number; months: number } | null;
  class_name?: string | null;
  class?: { name?: string | null; kindergarten?: string | null } | null;
  kindergarten?: string | null;
  has_photo?: boolean | null;
  photo_url?: string | null;
  strengths?: ProfileItem[] | null;
  interests?: ProfileItem[] | null;
};

export type SharedContent = {
  id: string;
  title: string;
  content_type?: string | null;
  status?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
};

function arrayIn(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function flattenChild(raw: unknown): ParentChild | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const basics = r.basics && typeof r.basics === "object" ? (r.basics as Record<string, unknown>) : {};
  const merged = { ...basics, ...r } as Record<string, unknown>;
  if (typeof merged.id !== "string" && typeof basics.id === "string") merged.id = basics.id;
  if (typeof merged.id !== "string" || typeof merged.name !== "string") return null;
  return merged as unknown as ParentChild;
}

export function parentChildren(data: unknown): ParentChild[] {
  return arrayIn(data, ["children", "items"]).map(flattenChild).filter((c): c is ParentChild => c !== null);
}

export function parentChild(data: unknown): ParentChild | null {
  if (data && typeof data === "object" && "child" in data) return flattenChild((data as { child: unknown }).child);
  return flattenChild(data);
}

export function sharedContent(data: unknown): SharedContent[] {
  return arrayIn(data, ["content", "items", "contents"]).filter(
    (c): c is SharedContent => !!c && typeof c === "object" && typeof (c as SharedContent).id === "string",
  );
}

export function contentItem(data: unknown): SharedContent | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { content?: unknown; id?: unknown; title?: unknown };
  if (typeof d.id === "string" && typeof d.title === "string") return d as SharedContent;
  if (d.content && typeof d.content === "object") return contentItem(d.content);
  return null;
}

export const childDisplayName = (c: ParentChild) => c.preferred_name || c.name;

export function childPhoto(c: ParentChild): string | null {
  if (typeof c.photo_url === "string" && c.photo_url.startsWith("/api/")) return c.photo_url;
  return c.has_photo ? `/api/children/${encodeURIComponent(c.id)}/photo` : null;
}

export function className(c: ParentChild): string | null {
  return c.class?.name || c.class_name || null;
}

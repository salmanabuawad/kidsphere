import type { Role } from "@/lib/paths";

export type Language = "ar" | "he" | "en";

/** GET /api/users → {users: AdminUser[]} */
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  language: Language;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
};

/** GET /api/classes → {classes: ClassRow[]} */
export type ClassRow = {
  id: string;
  name: string;
  kindergarten: string;
  /** The kindergarten's theme (kindergarten_themes key), or null for the default look. */
  theme?: string | null;
  teachers: { id: string; name: string }[];
  child_count: number;
};

/** GET /api/children/{id}/parents → {parents: ParentLink[]} */
export type ParentLink = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  relation: string | null;
  linked_at: string | null;
};

/** The few child fields the admin pages need (GET /api/children, GET /api/children/{id}; owned by WP-05). */
export type ChildLite = {
  id: string;
  name: string;
  preferred_name?: string | null;
  class_id?: string | null;
};

export const ROLES: Role[] = ["admin", "teacher", "parent"];
export const LANGUAGES: Language[] = ["ar", "he", "en"];
export const MIN_PASSWORD = 10;

/** Accept {children: [...]}, {items: [...]} or a bare array. */
export function childrenOf(data: unknown): ChildLite[] {
  if (Array.isArray(data)) return data as ChildLite[];
  if (data && typeof data === "object") {
    const d = data as { children?: unknown; items?: unknown };
    if (Array.isArray(d.children)) return d.children as ChildLite[];
    if (Array.isArray(d.items)) return d.items as ChildLite[];
  }
  return [];
}

/** Accept {child: {...}} or the child object itself. */
export function childOf(data: unknown): ChildLite | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { child?: unknown; id?: unknown; name?: unknown; basics?: unknown };
  if (d.child && typeof d.child === "object") return childOf(d.child);
  if (d.basics && typeof d.basics === "object") return childOf({ id: d.id, ...(d.basics as object) });
  if (typeof d.name === "string") return d as ChildLite;
  return null;
}

export const displayName = (c: ChildLite) => c.preferred_name || c.name;

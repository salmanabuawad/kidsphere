import { createContext, useContext, type ReactNode } from "react";

/**
 * People of the child's life in a piece of content (backend services/people.py).
 *
 * The AI only ever writes a placeholder per person ("{grandfather}", "{friend_2}"); the
 * API sends `cast` with each placeholder's display name and photo flag, plus the child's
 * name and photo flag. A CastResolver puts the names in place of the placeholders and
 * finds the photos a text mentions (the people by placeholder, the child by name), so
 * the players can show the real people. Photos are served only through the API.
 */

export type CastPerson = {
  token: string | null;
  relation: string | null;
  person_id: string | null;
  display_name: string | null;
  has_photo: boolean;
  updated_at?: string | null;
};

export type ContentCast = {
  child?: { name?: string | null; has_photo?: boolean; updated_at?: string | null } | null;
  people?: CastPerson[] | null;
};

export type CastMember = { token: string; name: string; photo: string | null; relation: string | null };

export type CastResolver = {
  /** The text with every person placeholder replaced by the name the child uses. */
  text: (s: string) => string;
  /** Photo URLs of the people (by placeholder) and the child (by name) a RAW text mentions, in reading order. */
  photos: (s: string) => string[];
  members: CastMember[];
};

const enc = encodeURIComponent;
const versioned = (base: string, v?: string | null) => (v ? `${base}?v=${enc(v)}` : base);
export const personPhotoUrl = (id: string, version?: string | null) => versioned(`/api/people/${enc(id)}/photo`, version);
const childPhotoUrl = (id: string, version?: string | null) => versioned(`/api/children/${enc(id)}/photo`, version);

/** No people: text passes through unchanged and nothing has a photo. */
export const NO_CAST: CastResolver = { text: (s) => s, photos: () => [], members: [] };

/**
 * `fallbackName(relation)` names a person who was removed since the content was made
 * (e.g. "Grandfather" in the content language).
 */
export function castResolver(
  cast: ContentCast | null | undefined,
  childId: string | null | undefined,
  fallbackName: (relation: string | null) => string = () => "",
): CastResolver {
  const members: CastMember[] = (cast?.people ?? [])
    .filter((p): p is CastPerson & { token: string } => !!p && typeof p.token === "string" && p.token.length > 2)
    .map((p) => ({
      token: p.token,
      name: p.display_name?.trim() || fallbackName(p.relation ?? null),
      photo: p.has_photo && p.person_id ? personPhotoUrl(p.person_id, p.updated_at) : null,
      relation: p.relation ?? null,
    }));
  const childName = (cast?.child?.name ?? "").trim().toLocaleLowerCase();
  const childPhoto = cast?.child?.has_photo && childId ? childPhotoUrl(childId, cast.child.updated_at) : null;
  if (members.length === 0 && !childPhoto) return NO_CAST;

  return {
    members,
    text: (s) => members.reduce((acc, m) => acc.split(m.token).join(m.name), s),
    photos: (s) => {
      const found: { at: number; url: string }[] = [];
      for (const m of members) {
        const at = s.indexOf(m.token);
        if (at >= 0 && m.photo) found.push({ at, url: m.photo });
      }
      if (childPhoto && [...childName].length >= 2) {
        const at = s.toLocaleLowerCase().indexOf(childName);
        if (at >= 0) found.push({ at, url: childPhoto });
      }
      return found
        .sort((a, b) => a.at - b.at)
        .map((f) => f.url)
        .filter((u, i, all) => all.indexOf(u) === i);
    },
  };
}

/**
 * A copy of parsed content with every string resolved, and `photo` added to every object
 * with a `label` (a game choice, item or category) that mentions a person with a photo.
 */
export function castDeep<T>(value: T, cast: CastResolver): T {
  if (cast === NO_CAST) return value;
  if (typeof value === "string") return cast.text(value) as T;
  if (Array.isArray(value)) return value.map((v) => castDeep(v, cast)) as T;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = castDeep(v, cast);
    if (typeof o.label === "string") {
      const photo = cast.photos(o.label)[0];
      if (photo) out.photo = photo;
    }
    return out as T;
  }
  return value;
}

const CastContext = createContext<CastResolver>(NO_CAST);

/** Makes the people of one content item available to the players inside it. */
export function CastProvider({ value, children }: { value: CastResolver; children: ReactNode }) {
  return <CastContext.Provider value={value}>{children}</CastContext.Provider>;
}

export function useCast(): CastResolver {
  return useContext(CastContext);
}

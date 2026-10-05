/**
 * Every route path of the SPA (ARCHITECTURE §10 Routing), defined up front so
 * features can link to each other before the target feature exists.
 *
 *   <Link to={paths.child(id)}>…</Link>
 *   navigate(paths.childEdit(id, 3))
 *
 * `routePatterns` holds the matching react-router patterns for routes.tsx files.
 */
export type Id = string | number;
export type Role = "admin" | "teacher" | "parent";

const seg = (id: Id) => encodeURIComponent(String(id));

export const routePatterns = {
  home: "/",
  login: "/login",
  account: "/account",
  children: "/children",
  newChild: "/children/new",
  child: "/children/:id",
  childEdit: "/children/:id/edit/:step",
  childFocus: "/children/:id/focus",
  childObserve: "/children/:id/observe",
  observe: "/observe",
  childTimeline: "/children/:id/timeline",
  childContent: "/children/:id/content",
  newContent: "/children/:id/content/new",
  content: "/content/:id",
  presentContent: "/content/:id/present",
  pack: "/packs/:packId",
  childDevelopment: "/children/:id/development",
  newReview: "/children/:id/review/new",
  adminUsers: "/admin/users",
  adminClasses: "/admin/classes",
  adminChildParents: "/admin/children/:id/parents",
  parentHome: "/parent",
  parentOnboarding: "/parent/children/:id/onboarding",
  parentChildContent: "/parent/children/:id/content",
  parentContent: "/parent/content/:id",
} as const;

export const paths = {
  home: () => "/",
  /** `next` must be a same-site path; it is validated again by safeNext() on the login page. */
  login: (next?: string | null) => (next ? `/login?next=${encodeURIComponent(next)}` : "/login"),
  account: () => "/account",

  children: () => "/children",
  newChild: () => "/children/new",
  child: (id: Id) => `/children/${seg(id)}`,
  childEdit: (id: Id, step: number | string = 1) => `/children/${seg(id)}/edit/${seg(step)}`,
  childFocus: (id: Id) => `/children/${seg(id)}/focus`,
  childObserve: (id: Id) => `/children/${seg(id)}/observe`,
  observe: () => "/observe",
  childTimeline: (id: Id) => `/children/${seg(id)}/timeline`,
  childContent: (id: Id) => `/children/${seg(id)}/content`,
  /** Optional query, e.g. {mode: "growth_support", focus: focusId}. */
  newContent: (id: Id, query?: Record<string, string | undefined>) => {
    const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]).toString() : "";
    return `/children/${seg(id)}/content/new${qs ? `?${qs}` : ""}`;
  },
  content: (id: Id) => `/content/${seg(id)}`,
  presentContent: (id: Id) => `/content/${seg(id)}/present`,
  pack: (packId: Id) => `/packs/${seg(packId)}`,
  childDevelopment: (id: Id) => `/children/${seg(id)}/development`,
  newReview: (id: Id) => `/children/${seg(id)}/review/new`,

  adminUsers: () => "/admin/users",
  adminClasses: () => "/admin/classes",
  adminChildParents: (id: Id) => `/admin/children/${seg(id)}/parents`,

  parentHome: () => "/parent",
  parentOnboarding: (id: Id) => `/parent/children/${seg(id)}/onboarding`,
  parentChildContent: (id: Id) => `/parent/children/${seg(id)}/content`,
  parentContent: (id: Id) => `/parent/content/${seg(id)}`,
} as const;

/** Where each role lands after login and on "/". */
export function homeFor(role: Role): string {
  if (role === "admin") return paths.adminUsers();
  if (role === "teacher") return paths.children();
  return paths.parentHome();
}

/**
 * Accept only same-site absolute paths for ?next= (open-redirect guard).
 * Rejects "//evil.com", "/\\evil.com", "https://…", "javascript:…", control characters and the login page itself.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || typeof next !== "string") return null;
  if (next.length > 2000) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return null;
  try {
    const u = new URL(next, "http://same.invalid");
    if (u.origin !== "http://same.invalid") return null;
    if (u.pathname === "/login") return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

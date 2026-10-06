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

/** Optional query values for the newer builders; null/undefined/"" are skipped, arrays repeat the key. */
export type PathQuery = Record<string, string | number | boolean | null | undefined | readonly (string | number)[]>;

function withQs(path: string, query?: PathQuery): string {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)));
    else if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/** How staff enter the family's questionnaire answers: for them, or together in a meeting (PQM.entry_mode). */
export type ParentEntryMode = "on_behalf" | "meeting";

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

  // Source-document workflow (COVERAGE-MATRIX §5): the child profile tabs and their pages.
  childParentView: "/children/:id/parent-view",
  childParentAnswers: "/children/:id/parent-view/answers/:step",
  childQuickBaseline: "/children/:id/quick-baseline",
  childTeacherObservation: "/children/:id/teacher-observation",
  childPlan: "/children/:id/plan",
  childObservations: "/children/:id/observations",
  childObservation: "/children/:id/observations/:observationId",
  childDevelopmentTimeline: "/children/:id/development/timeline",
  childReports: "/children/:id/reports",
  parentOnboardingStep: "/parent/children/:id/onboarding/:step",
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

  /** Parent View tab: the complete questionnaire, read-only (PV). */
  childParentView: (id: Id, query?: PathQuery) => withQs(`/children/${seg(id)}/parent-view`, query),
  /** Staff fill the 9 questionnaire steps for the family (`on_behalf`) or together with them (`meeting`). */
  childParentAnswers: (id: Id, step: number | string = 1, mode: ParentEntryMode = "on_behalf") =>
    withQs(`/children/${seg(id)}/parent-view/answers/${seg(step)}`, { mode }),
  /** Teacher Quick Baseline, one screen (QB). */
  childQuickBaseline: (id: Id) => `/children/${seg(id)}/quick-baseline`,
  /** Teacher Observation tab (TO); e.g. {cycle: assessmentId, domain: "social"}. */
  childTeacherObservation: (id: Id, query?: PathQuery) => withQs(`/children/${seg(id)}/teacher-observation`, query),
  /** Plan tab: goals and the short plan (PL). */
  childPlan: (id: Id, query?: PathQuery) => withQs(`/children/${seg(id)}/plan`, query),
  /** Observations tab (OB); filters live in the query: {date_from, date_to, focus_area_id, domain, context, source}. */
  childObservations: (id: Id, query?: PathQuery) => withQs(`/children/${seg(id)}/observations`, query),
  /** One observation inside the Observations tab (detail with versions). */
  childObservation: (id: Id, observationId: Id) => `/children/${seg(id)}/observations/${seg(observationId)}`,
  /** Timeline as a section of the Development tab, with the same URL filters (DV.timeline). */
  childDevelopmentTimeline: (id: Id, query?: PathQuery) => withQs(`/children/${seg(id)}/development/timeline`, query),
  /** Reports tab and export dialog (RP); e.g. {type: "intervention_plan"} presets the report. */
  childReports: (id: Id, query?: PathQuery) => withQs(`/children/${seg(id)}/reports`, query),
  /** The parent's own questionnaire wizard at step 1–9 (PW1–PW9). */
  parentOnboardingStep: (id: Id, step: number | string) => `/parent/children/${seg(id)}/onboarding/${seg(step)}`,
} as const;

/** The 8 child profile tabs in logical order (mirrored automatically in RTL); X-33 / COVERAGE-MATRIX §5.1. */
export const CHILD_TABS = ["overview", "parentView", "teacherObservation", "plan", "activities", "observations", "development", "reports"] as const;
export type ChildTab = (typeof CHILD_TABS)[number];

/** Where each child tab lives. */
export function childTabPath(tab: ChildTab, id: Id): string {
  switch (tab) {
    case "overview":
      return paths.child(id);
    case "parentView":
      return paths.childParentView(id);
    case "teacherObservation":
      return paths.childTeacherObservation(id);
    case "plan":
      return paths.childPlan(id);
    case "activities":
      return paths.childContent(id);
    case "observations":
      return paths.childObservations(id);
    case "development":
      return paths.childDevelopment(id);
    case "reports":
      return paths.childReports(id);
  }
}

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

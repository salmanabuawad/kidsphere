import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "./paths";

/**
 * Navigation metadata on a route. AppShell builds the sidebar (desktop) and the
 * bottom bar (phone/tablet) from these, sorted by `order`.
 */
export type NavMeta = {
  /** Full i18n key, e.g. "nav.children". */
  labelKey: string;
  icon: LucideIcon;
  order: number;
  /** Who sees the item; defaults to the route's roles (or everyone signed in). */
  roles?: Role[];
  /**
   * The primary action (e.g. "+ Observation"): rendered as the raised centre
   * button of the phone bottom bar and as the primary button on top of the
   * desktop sidebar. Use for at most one item per role.
   */
  action?: boolean;
  /** Link target when it differs from the route path (the path must not contain params). */
  to?: string;
};

/**
 * One route contributed by a feature: export `routes: AppRoute[]` from
 * src/features/<name>/routes.tsx and it is picked up automatically.
 */
export type AppRoute = {
  /** Absolute path pattern, preferably from routePatterns in lib/paths.ts. */
  path: string;
  element: ReactNode;
  /** Allowed roles; omit to allow every signed-in user. Ignored for public routes. */
  roles?: Role[];
  /** No sign-in required (login). */
  public?: boolean;
  /** "shell" (default for signed-in routes) renders inside AppShell; "bare" renders full-screen (login, present mode). */
  layout?: "shell" | "bare";
  nav?: NavMeta;
};

export type NavItem = Required<Pick<NavMeta, "labelKey" | "icon" | "order">> & { to: string; roles?: Role[]; action: boolean };

/** Collect nav items from route metadata, sorted by order. */
export function buildNav(routes: AppRoute[]): NavItem[] {
  return routes
    .filter((r) => r.nav && !r.public)
    .map((r) => ({
      to: r.nav!.to ?? r.path,
      labelKey: r.nav!.labelKey,
      icon: r.nav!.icon,
      order: r.nav!.order,
      roles: r.nav!.roles ?? r.roles,
      action: !!r.nav!.action,
    }))
    .sort((a, b) => a.order - b.order);
}

export function navFor(nav: NavItem[], role: Role | undefined): NavItem[] {
  return nav.filter((i) => !i.roles || (role !== undefined && i.roles.includes(role)));
}

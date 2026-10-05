import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { homeFor, paths, type Role } from "@/lib/paths";
import { useAuth } from "./AuthProvider";

/**
 * Guards a route: waits for the session check, sends anonymous users to
 * /login?next=<this path>, and sends users without one of `roles` to their home.
 * Renders `children`, or an <Outlet/> when used as a layout route.
 */
export function RequireRole({ roles, children }: { roles?: Role[]; children?: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullPageSpinner />;
  if (!user) {
    const here = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={here === "/" ? paths.login() : paths.login(here)} replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children ?? <Outlet />;
}

/** "/" → the role's home. */
export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : paths.login()} replace />;
}

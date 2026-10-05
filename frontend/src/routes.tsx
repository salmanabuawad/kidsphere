import { Outlet, ScrollRestoration, type RouteObject } from "react-router";
import { HomeRedirect, RequireRole } from "@/auth/RequireRole";
import { AppShell } from "@/components/layout/AppShell";
import { NotFoundPage, RouteError } from "@/components/layout/NotFoundPage";
import { buildNav, type AppRoute, type NavItem } from "@/lib/routing";

export type { AppRoute, NavMeta, NavItem } from "@/lib/routing";

/**
 * Every feature contributes `export const routes: AppRoute[]` from
 * src/features/<name>/routes.tsx; nothing else needs editing.
 */
const modules = import.meta.glob<{ routes?: AppRoute[] }>("./features/*/routes.tsx", { eager: true });

export const featureRoutes: AppRoute[] = Object.values(modules).flatMap((m) => m.routes ?? []);
export const navItems: NavItem[] = buildNav(featureRoutes);

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

function guarded(r: AppRoute): RouteObject {
  return { path: r.path, element: r.roles ? <RequireRole roles={r.roles}>{r.element}</RequireRole> : r.element };
}

/** Route tree: public routes, bare signed-in routes, then the AppShell layout with "/" redirect and the 404. */
export function buildRouteObjects(routes: AppRoute[], nav: NavItem[] = buildNav(routes)): RouteObject[] {
  const publicRoutes = routes.filter((r) => r.public);
  const bare = routes.filter((r) => !r.public && r.layout === "bare");
  const shell = routes.filter((r) => !r.public && r.layout !== "bare");
  return [
    {
      path: "/",
      element: <Root />,
      errorElement: <RouteError />,
      children: [
        ...publicRoutes.map((r) => ({ path: r.path, element: r.element })),
        {
          element: <RequireRole />,
          children: [
            ...bare.map(guarded),
            {
              element: (
                <AppShell nav={nav}>
                  <Outlet />
                </AppShell>
              ),
              children: [{ index: true, element: <HomeRedirect /> }, ...shell.map(guarded), { path: "*", element: <NotFoundPage /> }],
            },
          ],
        },
      ],
    },
  ];
}

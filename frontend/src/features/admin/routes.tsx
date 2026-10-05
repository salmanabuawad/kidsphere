import { ClassesIcon, UsersIcon } from "@/icons";
import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ChildParentsPage } from "./ChildParentsPage";
import { ClassesPage } from "./ClassesPage";
import { UsersPage } from "./UsersPage";

export const routes: AppRoute[] = [
  { path: routePatterns.adminUsers, element: <UsersPage />, roles: ["admin"], nav: { labelKey: "nav.users", icon: UsersIcon, order: 80 } },
  { path: routePatterns.adminClasses, element: <ClassesPage />, roles: ["admin"], nav: { labelKey: "nav.classes", icon: ClassesIcon, order: 85 } },
  // Reached from the Classes page (children per class) and, later, from the child page.
  { path: routePatterns.adminChildParents, element: <ChildParentsPage />, roles: ["admin"] },
];

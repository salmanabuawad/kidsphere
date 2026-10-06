import { Settings } from "lucide-react";
import { ClassesIcon, UsersIcon } from "@/icons";
import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ChildParentsPage } from "./ChildParentsPage";
import { ClassesPage } from "./ClassesPage";
import { SettingsPage } from "./SettingsPage";
import { UsersPage } from "./UsersPage";

export const routes: AppRoute[] = [
  { path: routePatterns.adminUsers, element: <UsersPage />, roles: ["admin"], nav: { labelKey: "nav.users", icon: UsersIcon, order: 80 } },
  { path: routePatterns.adminClasses, element: <ClassesPage />, roles: ["admin"], nav: { labelKey: "nav.classes", icon: ClassesIcon, order: 85 } },
  // No custom block glyph fits "settings" yet, so the nav uses lucide's Settings.
  { path: routePatterns.adminSettings, element: <SettingsPage />, roles: ["admin"], nav: { labelKey: "nav.settings", icon: Settings, order: 90 } },
  // Reached from the Classes page (children per class) and, later, from the child page.
  { path: routePatterns.adminChildParents, element: <ChildParentsPage />, roles: ["admin"] },
];

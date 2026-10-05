import { Users } from "lucide-react";
import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ChildListPage } from "./ChildListPage";
import { ChildProfilePage } from "./ChildProfilePage";

/**
 * /children is the teacher home (homeFor("teacher")). /children/new and
 * /children/:id/edit/:step belong to the wizard (WP-06); the static "new"
 * segment outranks ":id" in react-router.
 */
export const routes: AppRoute[] = [
  {
    path: routePatterns.children,
    element: <ChildListPage />,
    roles: ["teacher", "admin"],
    nav: { labelKey: "nav.children", icon: Users, order: 10, roles: ["teacher", "admin"] },
  },
  { path: routePatterns.child, element: <ChildProfilePage />, roles: ["teacher", "admin"] },
];

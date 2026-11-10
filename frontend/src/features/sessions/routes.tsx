import { Users } from "lucide-react";
import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { SessionPage, SessionsPage } from "./SessionPages";

/** Class sessions: a group activity run with a class, and how each child did. */
export const routes: AppRoute[] = [
  {
    path: routePatterns.sessions,
    element: <SessionsPage />,
    roles: ["teacher", "admin"],
    nav: { labelKey: "nav.sessions", icon: Users, order: 35, roles: ["teacher", "admin"] },
  },
  { path: routePatterns.session, element: <SessionPage />, roles: ["teacher", "admin"] },
];

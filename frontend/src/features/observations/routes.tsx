import { Plus } from "lucide-react";
import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ChildObservePage, ObservePickerPage } from "./ObservePages";

/**
 * /observe is the centre "+" of the phone bottom bar (nav.action) and the
 * primary sidebar button; /children/:id/observe opens the form directly.
 */
export const routes: AppRoute[] = [
  {
    path: routePatterns.observe,
    element: <ObservePickerPage />,
    roles: ["teacher", "admin"],
    nav: { labelKey: "nav.observe", icon: Plus, order: 50, roles: ["teacher", "admin"], action: true },
  },
  { path: routePatterns.childObserve, element: <ChildObservePage />, roles: ["teacher", "admin"] },
];

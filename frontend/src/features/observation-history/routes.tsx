import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ObservationDetailPage } from "./ObservationDetailPage";
import { ObservationsPage } from "./ObservationsPage";

/** The child's Observations tab (OB) and one observation with its versions. Staff only. */
export const routes: AppRoute[] = [
  { path: routePatterns.childObservations, element: <ObservationsPage />, roles: ["teacher", "admin"] },
  { path: routePatterns.childObservation, element: <ObservationDetailPage />, roles: ["teacher", "admin"] },
];

import { Navigate, useLocation, useParams } from "react-router";
import { paths, routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { PlanPage } from "./PlanPage";

/** The old Current Focus address now opens the Plan tab (links from earlier pages keep working). */
function FocusRedirect() {
  const { id = "" } = useParams();
  const { search } = useLocation();
  return <Navigate to={`${paths.childPlan(id)}${search}`} replace />;
}

/** Child tab "Plan": the goals of the short plan (Domain 15). Staff only. */
export const routes: AppRoute[] = [
  { path: routePatterns.childPlan, element: <PlanPage />, roles: ["teacher", "admin"] },
  { path: routePatterns.childFocus, element: <FocusRedirect />, roles: ["teacher", "admin"] },
];

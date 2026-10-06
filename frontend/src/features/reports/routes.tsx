import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ReportsPage } from "./ReportsPage";

/** The child's Reports tab (RP): PDF export dialog and export log. Staff only (parents get 404 from the API too). */
export const routes: AppRoute[] = [{ path: routePatterns.childReports, element: <ReportsPage />, roles: ["teacher", "admin"] }];

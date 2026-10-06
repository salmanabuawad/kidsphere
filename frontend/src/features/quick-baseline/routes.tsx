import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { QuickBaselinePage } from "./QuickBaselinePage";

// Teacher Quick Baseline: the teacher's part after reading the family's answers (WP2-PQ, X-03 / X-07).
export const routes: AppRoute[] = [{ path: routePatterns.childQuickBaseline, element: <QuickBaselinePage />, roles: ["admin", "teacher"] }];

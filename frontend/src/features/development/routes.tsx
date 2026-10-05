import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { DevelopmentPage } from "./DevelopmentPage";
import { ReviewPage } from "./ReviewPage";

/** Child tab "Development" (ChildTabs links here) and the "Review development" flow. Staff only. */
export const routes: AppRoute[] = [
  { path: routePatterns.childDevelopment, element: <DevelopmentPage />, roles: ["teacher", "admin"] },
  { path: routePatterns.newReview, element: <ReviewPage />, roles: ["teacher", "admin"] },
];

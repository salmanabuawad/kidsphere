import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ChildEditPage, NewChildPage, ParentOnboardingPage } from "./pages";

// Add Child wizard (staff), its resumable edit steps, and the parent onboarding (WP-06).
export const routes: AppRoute[] = [
  { path: routePatterns.newChild, element: <NewChildPage />, roles: ["admin", "teacher"] },
  { path: routePatterns.childEdit, element: <ChildEditPage />, roles: ["admin", "teacher"] },
  { path: routePatterns.parentOnboarding, element: <ParentOnboardingPage />, roles: ["parent"] },
];

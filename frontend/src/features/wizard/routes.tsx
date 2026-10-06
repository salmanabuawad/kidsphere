import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ChildEditPage, NewChildPage, ParentOnboardingPage } from "./pages";

// Add Child wizard (staff), its resumable edit steps, and the family's questionnaire (PW1–PW9, WP2-PQ).
export const routes: AppRoute[] = [
  { path: routePatterns.newChild, element: <NewChildPage />, roles: ["admin", "teacher"] },
  { path: routePatterns.childEdit, element: <ChildEditPage />, roles: ["admin", "teacher"] },
  { path: routePatterns.parentOnboarding, element: <ParentOnboardingPage />, roles: ["parent"] },
  { path: routePatterns.parentOnboardingStep, element: <ParentOnboardingPage />, roles: ["parent"] },
];

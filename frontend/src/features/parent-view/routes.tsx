import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ParentAnswersPage } from "./ParentAnswersPage";
import { ParentViewPage } from "./ParentViewPage";

// Parent View tab (the family's complete questionnaire) and the staff entry of their answers (WP2-PQ).
export const routes: AppRoute[] = [
  { path: routePatterns.childParentView, element: <ParentViewPage />, roles: ["admin", "teacher"] },
  { path: routePatterns.childParentAnswers, element: <ParentAnswersPage />, roles: ["admin", "teacher"] },
];

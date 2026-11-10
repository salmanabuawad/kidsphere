import { Lightbulb, Sprout } from "lucide-react";
import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { AdminProgramsPage } from "./AdminProgramsPage";
import { CopilotPage } from "./CopilotPage";

export const routes: AppRoute[] = [
  { path: routePatterns.adminFamilyPrograms, element: <AdminProgramsPage />, roles: ["admin"], nav: { labelKey: "nav.familyPrograms", icon: Sprout, order: 87 } },
  { path: routePatterns.parentCopilot, element: <CopilotPage />, roles: ["parent", "teacher", "admin"], nav: { labelKey: "nav.parentCopilot", icon: Lightbulb, order: 12, roles: ["parent"] } },
];

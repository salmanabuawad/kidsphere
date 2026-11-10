import { Sprout } from "lucide-react";
import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { AdminProgramsPage } from "./AdminProgramsPage";

export const routes: AppRoute[] = [
  { path: routePatterns.adminFamilyPrograms, element: <AdminProgramsPage />, roles: ["admin"], nav: { labelKey: "nav.familyPrograms", icon: Sprout, order: 87 } },
];

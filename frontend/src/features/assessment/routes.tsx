import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { TeacherObservationPage } from "./TeacherObservationPage";

/** Teacher Observation tab of a child (staff only): /children/:id/teacher-observation?cycle&domain. */
export const routes: AppRoute[] = [
  { path: routePatterns.childTeacherObservation, element: <TeacherObservationPage />, roles: ["teacher", "admin"] },
];

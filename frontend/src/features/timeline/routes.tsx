import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { TimelinePage, TimelineRedirect } from "./TimelinePage";

/**
 * Development › Timeline (a section of the Development tab, X-33) and the old
 * /children/:id/timeline tab, which redirects there (filters kept).
 */
export const routes: AppRoute[] = [
  { path: routePatterns.childDevelopmentTimeline, element: <TimelinePage />, roles: ["teacher", "admin"] },
  { path: routePatterns.childTimeline, element: <TimelineRedirect />, roles: ["teacher", "admin"] },
];

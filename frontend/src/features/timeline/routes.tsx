import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { TimelinePage } from "./TimelinePage";

/** Child tab "Timeline" (ChildTabs links here). */
export const routes: AppRoute[] = [{ path: routePatterns.childTimeline, element: <TimelinePage />, roles: ["teacher", "admin"] }];

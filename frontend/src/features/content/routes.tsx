import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ContentListPage } from "./ContentListPage";
import { ContentReviewPage } from "./ContentReviewPage";
import { CreateContentPage } from "./CreateContentPage";
import { PackPage } from "./PackPage";
import { PresentPage } from "./PresentPage";

/**
 * Staff content pages (WP-11). The parent pages (/parent/children/:id/content,
 * /parent/content/:id) are routed by features/parent, which re-exports
 * ParentChildContentPage / ParentContentPage from this feature.
 */
export const routes: AppRoute[] = [
  { path: routePatterns.childContent, element: <ContentListPage />, roles: ["teacher", "admin"] },
  { path: routePatterns.newContent, element: <CreateContentPage />, roles: ["teacher", "admin"] },
  { path: routePatterns.content, element: <ContentReviewPage />, roles: ["teacher", "admin"] },
  { path: routePatterns.presentContent, element: <PresentPage />, roles: ["teacher", "admin"], layout: "bare" },
  { path: routePatterns.pack, element: <PackPage />, roles: ["teacher", "admin"] },
];

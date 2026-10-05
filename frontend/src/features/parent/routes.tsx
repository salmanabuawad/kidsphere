import { Heart } from "lucide-react";
import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { ParentHomePage } from "./ParentHomePage";
import { ParentChildContentPage, ParentContentPage } from "./SharedContentPages";

// /parent/children/:id/onboarding is the WP-06 wizard's route.
// The two shared-content routes are simple placeholders until WP-11 replaces them.
export const routes: AppRoute[] = [
  { path: routePatterns.parentHome, element: <ParentHomePage />, roles: ["parent"], nav: { labelKey: "nav.parentHome", icon: Heart, order: 10 } },
  { path: routePatterns.parentChildContent, element: <ParentChildContentPage />, roles: ["parent"] },
  { path: routePatterns.parentContent, element: <ParentContentPage />, roles: ["parent"] },
];

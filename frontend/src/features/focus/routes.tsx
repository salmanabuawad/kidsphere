import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { FocusPage } from "./FocusPage";

export const routes: AppRoute[] = [{ path: routePatterns.childFocus, element: <FocusPage />, roles: ["teacher", "admin"] }];

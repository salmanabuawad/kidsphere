import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { AccountPage } from "./AccountPage";
import { LoginPage } from "./LoginPage";

export const routes: AppRoute[] = [
  { path: routePatterns.login, element: <LoginPage />, public: true },
  // Reachable from the user block in AppShell (sidebar / menu sheet), so no nav entry.
  { path: routePatterns.account, element: <AccountPage /> },
];

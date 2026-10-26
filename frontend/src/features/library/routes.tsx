import { LibraryBig } from "lucide-react";
import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { AdminLibraryItemPage, AdminLibraryNewItemPage, AdminLibraryPage } from "./AdminLibraryPages";
import { LibraryItemPage, LibraryPage } from "./LibraryPages";

/**
 * The content library: staff give published items to children as drafts; admins manage it.
 * The static "new" segment outranks ":id" in react-router.
 */
export const routes: AppRoute[] = [
  {
    path: routePatterns.library,
    element: <LibraryPage />,
    roles: ["teacher", "admin"],
    nav: { labelKey: "nav.library", icon: LibraryBig, order: 30, roles: ["teacher", "admin"] },
  },
  { path: routePatterns.libraryItem, element: <LibraryItemPage />, roles: ["teacher", "admin"] },
  {
    path: routePatterns.adminLibrary,
    element: <AdminLibraryPage />,
    roles: ["admin"],
    nav: { labelKey: "nav.adminLibrary", icon: LibraryBig, order: 86 },
  },
  { path: routePatterns.adminLibraryNewItem, element: <AdminLibraryNewItemPage />, roles: ["admin"] },
  { path: routePatterns.adminLibraryItem, element: <AdminLibraryItemPage />, roles: ["admin"] },
];

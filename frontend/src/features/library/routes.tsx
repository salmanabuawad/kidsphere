import { LibraryBig } from "lucide-react";
import { routePatterns } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { LibraryItemPage, LibraryPage } from "./LibraryPages";

/** The content library: ready-made content staff assign to children as drafts. */
export const routes: AppRoute[] = [
  {
    path: routePatterns.library,
    element: <LibraryPage />,
    roles: ["teacher", "admin"],
    nav: { labelKey: "nav.library", icon: LibraryBig, order: 30, roles: ["teacher", "admin"] },
  },
  { path: routePatterns.libraryItem, element: <LibraryItemPage />, roles: ["teacher", "admin"] },
];

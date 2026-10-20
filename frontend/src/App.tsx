import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { AuthProvider } from "@/auth/AuthProvider";
import { EntrancePage } from "@/components/layout/EntrancePage";
import { Toaster } from "@/components/ui/Toast";
import { I18nProvider } from "@/i18n/I18nProvider";
import { CURRENT_BRAND, entranceRedirect, IN_ENTRANCE } from "@/lib/brand";
import { OptionsProvider } from "@/lib/options";
import { buildRouteObjects, featureRoutes, navItems } from "@/routes";

/**
 * Outside an entrance (lib/brand): the root shows the chooser, and an old link (/children/…)
 * moves under /sharnaqa. Inside one the app runs with the entrance as the router base.
 * Providers: Auth (GET /api/me) → I18n (starts in the entrance's language) → Options → router.
 */
export function App() {
  if (!IN_ENTRANCE) {
    const to = entranceRedirect(window.location.pathname, window.location.search, window.location.hash);
    if (to) {
      window.location.replace(to);
      return null;
    }
    return <EntrancePage />;
  }
  return <BrandApp />;
}

function BrandApp() {
  const [router] = useState(() => createBrowserRouter(buildRouteObjects(featureRoutes, navItems), { basename: CURRENT_BRAND.base }));
  return (
    <AuthProvider>
      <I18nProvider>
        <OptionsProvider>
          <RouterProvider router={router} />
          <Toaster />
        </OptionsProvider>
      </I18nProvider>
    </AuthProvider>
  );
}

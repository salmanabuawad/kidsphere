import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { AuthProvider } from "@/auth/AuthProvider";
import { Toaster } from "@/components/ui/Toast";
import { I18nProvider } from "@/i18n/I18nProvider";
import { OptionsProvider } from "@/lib/options";
import { buildRouteObjects, featureRoutes, navItems } from "@/routes";

/** Providers: Auth (GET /api/me) → I18n (adopts user.language) → Options (GET /api/options) → router. */
export function App() {
  const [router] = useState(() => createBrowserRouter(buildRouteObjects(featureRoutes, navItems)));
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

import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { AuthProvider, type User } from "@/auth/AuthProvider";
import { Toaster } from "@/components/ui/Toast";
import type { AppLocale } from "@/i18n/config";
import { I18nProvider } from "@/i18n/I18nProvider";
import { OptionsProvider, type OptionLists } from "@/lib/options";
import type { AppRoute } from "@/lib/routing";
import { buildRouteObjects } from "@/routes";

export type MockResponse = { status?: number; body?: unknown };
export type Handler = MockResponse | ((init: RequestInit | undefined, url: string) => MockResponse);

/**
 * Stub global fetch. Keys are "METHOD /path" (query string ignored).
 * Unmatched requests return 404 NOT_FOUND. Returns the vi.fn for call assertions.
 */
export function mockFetch(handlers: Record<string, Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.split("?")[0]!;
    const method = (init?.method ?? "GET").toUpperCase();
    const h = handlers[`${method} ${path}`];
    const res: MockResponse = h === undefined ? { status: 404, body: { error: { code: "NOT_FOUND", message: "nf" } } } : typeof h === "function" ? h(init, url) : h;
    const status = res.status ?? 200;
    if (status === 204) return new Response(null, { status });
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export const teacher: User = { id: "u-teacher", name: "Rana Haddad", email: "rana@example.org", role: "teacher", language: "en" };
export const parent: User = { id: "u-parent", name: "Dana Levi", email: "dana@example.org", role: "parent", language: "en" };

/** Full app tree (providers + data router) on a memory history. */
export function renderApp({
  routes,
  url = "/",
  user,
  locale = "en",
  options = {},
}: {
  routes: AppRoute[];
  url?: string;
  /** undefined → AuthProvider calls GET /api/me (mock it). */
  user?: User | null;
  locale?: AppLocale;
  options?: OptionLists;
}) {
  window.localStorage.setItem("ks_locale", locale);
  document.documentElement.lang = locale;
  const router = createMemoryRouter(buildRouteObjects(routes), { initialEntries: [url] });
  const utils = render(
    <AuthProvider initialUser={user}>
      <I18nProvider>
        <OptionsProvider initial={options}>
          <RouterProvider router={router} />
          <Toaster />
        </OptionsProvider>
      </I18nProvider>
    </AuthProvider>,
  );
  return { router, ...utils };
}

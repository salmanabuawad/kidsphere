import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/auth/AuthProvider";
import { routes as authRoutes } from "@/features/auth/routes";
import { createTranslator } from "@/i18n/translate";
import { api, ApiError, errorMessage, fieldErrors } from "@/lib/api";
import { safeNext } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import ar from "@/i18n/messages/ar/errors.json";
import en from "@/i18n/messages/en/errors.json";
import { mockFetch, renderApp, teacher } from "./utils";

describe("api()", () => {
  it("maps {error:{code:'RATE_LIMITED'}} to ApiError and the localized errors.RATE_LIMITED message", async () => {
    mockFetch({ "POST /api/auth/login": { status: 429, body: { error: { code: "RATE_LIMITED", message: "slow down", details: null } } } });
    const err = await api("/api/auth/login", { body: { identifier: "a", password: "b" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("RATE_LIMITED");
    expect((err as ApiError).status).toBe(429);
    expect(errorMessage(err, createTranslator("ar"))).toBe(ar.RATE_LIMITED);
    expect(errorMessage(err, createTranslator("en"))).toBe(en.RATE_LIMITED);
  });

  it("falls back to errors.INTERNAL for unknown codes and non-API errors", async () => {
    mockFetch({ "GET /api/x": { status: 500, body: { error: { code: "SOMETHING_NEW", message: "?" } } } });
    const err = await api("/api/x").catch((e: unknown) => e);
    expect(errorMessage(err, createTranslator("en"))).toBe(en.INTERNAL);
    expect(errorMessage(new Error("boom"), createTranslator("en"))).toBe(en.INTERNAL);
  });

  it("derives a code from the status when there is no envelope", async () => {
    mockFetch({ "GET /api/y": { status: 429 } });
    await expect(api("/api/y")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("reports network failures as NETWORK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(api("/api/me")).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("sends JSON with same-origin credentials and returns undefined for 204", async () => {
    const fetch = mockFetch({ "POST /api/auth/logout": { status: 204 } });
    await expect(api("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
    const fetch2 = mockFetch({ "PUT /api/me": { body: { user: teacher } } });
    await api("/api/me", { method: "PUT", body: { name: "R" } });
    const init = fetch2.mock.calls[0]![1]!;
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("extracts field errors from VALIDATION details", () => {
    const e = new ApiError("VALIDATION", "bad", 400, [{ path: ["body", "name"], message: "required" }, { path: "plan.need", message: "too long" }]);
    expect(fieldErrors(e)).toEqual({ name: "required", "plan.need": "too long" });
  });
});

describe("safeNext()", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/children/42?tab=timeline#x")).toBe("/children/42?tab=timeline#x");
    expect(safeNext("/account")).toBe("/account");
  });

  it.each(["//evil.com", "//evil.com/children", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/login", "", null, "/\u0000x"])(
    "rejects %j",
    (v) => {
      expect(safeNext(v as string | null)).toBeNull();
    },
  );
});

function Secret() {
  return <p>secret page</p>;
}

function ExpireButton() {
  const { user } = useAuth();
  return (
    <button onClick={() => void api("/api/children").catch(() => undefined)}>
      {user ? "signed in" : "signed out"}
    </button>
  );
}

const testRoutes: AppRoute[] = [
  ...authRoutes,
  { path: "/children/:id", element: <Secret />, roles: ["teacher", "admin"] },
  { path: "/children", element: <ExpireButton /> },
];

describe("auth redirects", () => {
  it("a 401 from /api/me navigates to /login with next preserved", async () => {
    mockFetch({ "GET /api/me": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "x" } } } });
    const { router } = renderApp({ routes: testRoutes, url: "/children/42?tab=timeline" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe("/children/42?tab=timeline");
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeTruthy();
  });

  it("the sign-in page leads with the KidSphere logo lockup above the card", async () => {
    mockFetch({ "GET /api/me": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "x" } } } });
    renderApp({ routes: testRoutes, url: "/login" });
    const heading = await screen.findByRole("heading", { level: 1 });
    const mark = screen.getByAltText("KidSphere");
    const lockup = mark.closest<HTMLElement>("[data-logo]")!;
    expect(lockup.dataset.logo).toBe("stacked");
    // A 72px mark: above the 64px stacked minimum, small enough to keep Sign in above a phone's fold.
    expect(mark.getAttribute("height")).toBe("72");
    expect(lockup.querySelectorAll("img.ks-logo-light, img.ks-logo-dark")).toHaveLength(2);
    expect(lockup.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('[data-icon="brand-mark"]')).toBeNull();
  });

  it("a 401 mid-session signs out and redirects with next", async () => {
    mockFetch({ "GET /api/children": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "x" } } } });
    const { router } = renderApp({ routes: testRoutes, url: "/children", user: teacher });
    const btn = await screen.findByRole("button", { name: "signed in" });
    await act(async () => btn.click());
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe("/children");
  });

  it("login honours a safe next and redirects there", async () => {
    mockFetch({
      "GET /api/me": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "x" } } },
      "POST /api/auth/login": { body: { user: teacher } },
    });
    const { router } = renderApp({ routes: testRoutes, url: "/login?next=%2Fchildren%2F7" });
    fireEvent.change(await screen.findByLabelText(/email or username/i), { target: { value: "rana" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct horse" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/children/7"));
    expect(await screen.findByText("secret page")).toBeTruthy();
  });

  it("login rejects next='//evil' and goes to the role home instead", async () => {
    const fetch = mockFetch({
      "GET /api/me": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "x" } } },
      "POST /api/auth/login": { body: { user: teacher } },
    });
    const { router } = renderApp({ routes: testRoutes, url: "/login?next=%2F%2Fevil.com" });
    fireEvent.change(await screen.findByLabelText(/email or username/i), { target: { value: "rana@example.org" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct horse" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/children"));
    const loginCall = fetch.mock.calls.find(([u]) => u === "/api/auth/login")!;
    expect(JSON.parse(String(loginCall[1]!.body))).toEqual({ identifier: "rana@example.org", password: "correct horse" });
  });

  it("shows the localized INVALID_CREDENTIALS message", async () => {
    mockFetch({
      "GET /api/me": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "x" } } },
      "POST /api/auth/login": { status: 401, body: { error: { code: "INVALID_CREDENTIALS", message: "nope" } } },
    });
    const { router } = renderApp({ routes: testRoutes, url: "/login" });
    fireEvent.change(await screen.findByLabelText(/email or username/i), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "y" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(en.INVALID_CREDENTIALS)).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("'/' redirects each role to its home", async () => {
    const { router } = renderApp({ routes: testRoutes, url: "/", user: { ...teacher, role: "parent" } });
    await waitFor(() => expect(router.state.location.pathname).toBe("/parent"));
  });

  it("a role-restricted route sends other roles home", async () => {
    const { router } = renderApp({ routes: testRoutes, url: "/children/3", user: { ...teacher, role: "parent" } });
    await waitFor(() => expect(router.state.location.pathname).toBe("/parent"));
    expect(screen.queryByText("secret page")).toBeNull();
  });
});

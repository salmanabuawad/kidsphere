import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { User } from "@/auth/AuthProvider";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { routes } from "./routes";
import type { AdminSettings, SystemStatus } from "./SettingsPage";

const me: User = { id: "u-admin", name: "Admin Person", email: "admin", role: "admin", language: "en" };

const settings: AdminSettings = {
  general: { organization_name: "Olive KG Network", default_ui_language: "ar", default_content_language: "child" },
  ai: {
    provider_mode: "claude",
    model: "claude-opus-5-5",
    effort: "medium",
    key_set: true,
    key_last4: "1234",
    env_key_set: false,
    effective_mode: "claude",
  },
  reports: { header_title: "KidSphere", footer_note: null },
};

const system: SystemStatus = {
  app_version: "abc1234",
  alembic_revision: "0003",
  last_backup_at: null,
  ai: { effective_mode: "claude", provider_mode: "claude", model: "claude-opus-5-5", key_source: "settings" },
  counts: { users: 12, classes: 3, children: 40 },
};

const body = (init: RequestInit | undefined) => JSON.parse(String(init?.body ?? "null"));

function form(name: string): HTMLElement {
  return screen.getByRole("form", { name });
}

describe("SettingsPage", () => {
  it("is in the admin nav and renders the four sections", async () => {
    mockFetch({ "GET /api/admin/settings": { body: settings }, "GET /api/admin/system": { body: system } });
    renderApp({ routes, url: "/admin/settings", user: me });
    expect(await screen.findByRole("heading", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "AI" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reports" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "System" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Settings/ }).length).toBeGreaterThan(0);
    expect((screen.getByLabelText(/Organization name/) as HTMLInputElement).value).toBe("Olive KG Network");
    expect(screen.getByText(/standard disclaimer is always printed/)).toBeTruthy();
    const status = await screen.findByTestId("system-status");
    expect(within(status).getByText("abc1234")).toBeTruthy();
    expect(within(status).getByText("0003")).toBeTruthy();
    expect(within(status).getByText("Not available")).toBeTruthy();
    expect(within(status).getByText("40")).toBeTruthy();
  });

  it("never displays the key: only its last four characters, in an empty password field", async () => {
    mockFetch({ "GET /api/admin/settings": { body: settings }, "GET /api/admin/system": { body: system } });
    renderApp({ routes, url: "/admin/settings", user: me });
    const key = (await screen.findByLabelText(/Anthropic API key/)) as HTMLInputElement;
    expect(key.type).toBe("password");
    expect(key.value).toBe("");
    expect(key.getAttribute("dir")).toBe("ltr");
    expect(screen.getByText("Saved key ends with …1234")).toBeTruthy();
    expect(document.body.textContent).not.toContain("sk-ant-");
    // The status badge says Claude.
    expect(within(form("AI")).getAllByText("Claude").length).toBeGreaterThan(0);
  });

  it("saves the general section with a toast", async () => {
    let sent: unknown = null;
    mockFetch({
      "GET /api/admin/settings": { body: settings },
      "GET /api/admin/system": { body: system },
      "PUT /api/admin/settings/general": (init) => {
        sent = body(init);
        return { body: { ...settings, general: { ...settings.general, organization_name: "New Name", default_ui_language: "he" } } };
      },
    });
    renderApp({ routes, url: "/admin/settings", user: me });
    const general = await screen.findByRole("form", { name: "General" });
    fireEvent.change(within(general).getByLabelText(/Organization name/), { target: { value: " New Name " } });
    fireEvent.change(within(general).getByLabelText(/Default interface language/), { target: { value: "he" } });
    fireEvent.click(within(general).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).toEqual({ organization_name: "New Name", default_ui_language: "he", default_content_language: "child" }));
    expect(await screen.findByText("General settings saved.")).toBeTruthy();
  });

  it("saves the AI section with a new key, switches to templates and clears the field", async () => {
    const sent: unknown[] = [];
    mockFetch({
      "GET /api/admin/settings": { body: settings },
      "GET /api/admin/system": { body: system },
      "PUT /api/admin/settings/ai": (init) => {
        sent.push(body(init));
        return { body: { ...settings, ai: { ...settings.ai, provider_mode: "template", effective_mode: "template", key_last4: "9876" } } };
      },
    });
    renderApp({ routes, url: "/admin/settings", user: me });
    const ai = await screen.findByRole("form", { name: "AI" });
    fireEvent.click(within(ai).getByRole("radio", { name: /Templates/ }));
    fireEvent.change(within(ai).getByLabelText(/Effort/), { target: { value: "high" } });
    fireEvent.change(within(ai).getByLabelText(/Anthropic API key/), { target: { value: "not-a-key" } });
    fireEvent.click(within(ai).getByRole("button", { name: "Save" }));
    expect(await within(ai).findByText("The key should start with sk-ant-.")).toBeTruthy();
    expect(sent).toEqual([]);
    fireEvent.change(within(ai).getByLabelText(/Anthropic API key/), { target: { value: "sk-ant-api03-new-key-9876" } });
    fireEvent.click(within(ai).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sent).toEqual([{ provider_mode: "template", model: "claude-opus-5-5", effort: "high", anthropic_api_key: "sk-ant-api03-new-key-9876" }]),
    );
    expect(await screen.findByText("AI settings saved.")).toBeTruthy();
    const key = (await screen.findByLabelText(/Anthropic API key/)) as HTMLInputElement;
    await waitFor(() => expect(key.value).toBe(""));
    expect(await screen.findByText("Saved key ends with …9876")).toBeTruthy();
  });

  it("clears the key and tests the connection", async () => {
    const sent: unknown[] = [];
    mockFetch({
      "GET /api/admin/settings": { body: settings },
      "GET /api/admin/system": { body: system },
      "PUT /api/admin/settings/ai": (init) => {
        sent.push(body(init));
        return { body: { ...settings, ai: { ...settings.ai, key_set: false, key_last4: null, effective_mode: "template" } } };
      },
      "POST /api/admin/settings/ai/test": { body: { ok: false, model: "claude-opus-5-5", error_code: "AI_AUTH" } },
    });
    renderApp({ routes, url: "/admin/settings", user: me });
    const ai = await screen.findByRole("form", { name: "AI" });
    fireEvent.click(within(ai).getByRole("button", { name: /Test connection/ }));
    expect(await screen.findByText("The key was not accepted. Check it and try again.")).toBeTruthy();
    fireEvent.click(within(ai).getByRole("button", { name: /Clear key/ }));
    await waitFor(() => expect(sent).toEqual([{ clear: true }]));
    expect(await screen.findByText("No key saved. The built-in templates are used.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Clear key/ })).toBeNull();
  });

  it("saves the reports section", async () => {
    let sent: unknown = null;
    mockFetch({
      "GET /api/admin/settings": { body: settings },
      "GET /api/admin/system": { body: system },
      "PUT /api/admin/settings/reports": (init) => {
        sent = body(init);
        return { body: { ...settings, reports: { header_title: "Olive KG", footer_note: "For the team." } } };
      },
    });
    renderApp({ routes, url: "/admin/settings", user: me });
    const reports = await screen.findByRole("form", { name: "Reports" });
    fireEvent.change(within(reports).getByLabelText(/Header title/), { target: { value: "Olive KG" } });
    fireEvent.change(within(reports).getByLabelText(/Footer note/), { target: { value: "For the team." } });
    fireEvent.click(within(reports).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).toEqual({ header_title: "Olive KG", footer_note: "For the team." }));
    expect(await screen.findByText("Report settings saved.")).toBeTruthy();
  });

  it("teachers cannot open the settings page", async () => {
    const fetch = mockFetch({});
    renderApp({ routes, url: "/admin/settings", user: teacher });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "General" })).toBeNull());
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/api/admin/settings"))).toBe(false);
  });
});

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { User } from "@/auth/AuthProvider";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import type { EngineRow, EnginesResponse } from "./AiEnginesPage";
import { routes } from "./routes";

const me: User = { id: "u-admin", name: "Admin Person", email: "admin", role: "admin", language: "en" };

const KEYS = [
  "reasoning", "child_understanding", "observation_analysis", "recommendation", "content_generation", "story", "character",
  "image_generation", "video_animator", "voice", "speech_recognition", "music", "sound_effects", "vision", "embedding",
  "classification", "translation", "safety_moderation", "personalization", "progress_analysis", "orchestration",
];

function row(engine: string, over: Partial<EngineRow> = {}): EngineRow {
  return {
    engine,
    output_kind: "structured",
    tasks: ["generate"],
    child_facing: engine === "story",
    long_running: engine === "video_animator",
    status: "not_configured",
    config: {
      enabled: false, provider: null, model: null, endpoint: null, credentials_ref: null, credentials_set: false,
      timeout_seconds: 60, max_retries: 1, max_output: null, daily_cost_limit: null, unit_cost: 0, safety_level: "strict",
      fallback_provider: null, fallback_model: null, source: "default",
    },
    last_success_at: null,
    last_error: null,
    usage_30d: { requests: 0, succeeded: 0, failed: 0 },
    cost_30d: 0,
    ...over,
  };
}

const data: EnginesResponse = {
  engines: KEYS.map((k) =>
    k === "recommendation"
      ? row(k, { status: "mock", config: { ...row(k).config, enabled: true, provider: "mock", source: "database" }, usage_30d: { requests: 4, succeeded: 3, failed: 1 }, last_error: { code: "PROVIDER_ERROR", at: "2026-10-06T10:00:00Z" } })
      : row(k),
  ),
  providers: ["mock"],
  mock_mode: false,
};

describe("AiEnginesPage", () => {
  it("lists the 21 engines with provider, status, usage and last error, and never a secret", async () => {
    mockFetch({ "GET /api/admin/ai/engines": { body: data }, "GET /api/admin/ai/requests": { body: { requests: [] } } });
    renderApp({ routes, url: "/admin/ai", user: me });
    expect(await screen.findByRole("heading", { name: "AI engines" })).toBeTruthy();
    expect(screen.getAllByTestId(/^engine-row-/)).toHaveLength(21);
    const video = screen.getByTestId("engine-row-video_animator");
    expect(within(video).getByText("Video animator")).toBeTruthy();
    expect(within(video).getAllByText("Not configured").length).toBeGreaterThan(0);
    const rec = screen.getByTestId("engine-row-recommendation");
    expect(within(rec).getByTestId("engine-status").getAttribute("data-status")).toBe("mock");
    expect(within(rec).getByText("PROVIDER_ERROR")).toBeTruthy();
    expect(within(rec).getByText("4 (1 failed)")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /AI engines/ }).length).toBeGreaterThan(0);
  });

  it("configures an engine by name (no secret field) and tests it", async () => {
    let sent: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/admin/ai/engines": { body: data },
      "GET /api/admin/ai/requests": { body: { requests: [] } },
      "PUT /api/admin/ai/engines/story": (init) => {
        sent = JSON.parse(String(init?.body));
        return { body: { engine: row("story") } };
      },
      "POST /api/admin/ai/engines/story/test": { body: { success: false, status: "not_configured", provider: null, model: null, error: { code: "ENGINE_NOT_CONFIGURED", message: "x" } } },
    });
    renderApp({ routes, url: "/admin/ai", user: me });
    fireEvent.click(await screen.findByRole("button", { name: "Story" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/key/i)).toBeNull();
    expect(within(dialog).getByText(/strict safety rules/)).toBeTruthy();
    fireEvent.click(within(dialog).getByTestId("engine-test"));
    expect((await within(dialog).findByTestId("engine-test-result")).textContent).toContain("ENGINE_NOT_CONFIGURED");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Use this engine" }));
    fireEvent.change(within(dialog).getByLabelText(/^Provider/), { target: { value: "mock" } });
    fireEvent.change(within(dialog).getByLabelText(/^Model/), { target: { value: "story-1" } });
    fireEvent.change(within(dialog).getByLabelText(/Credentials/), { target: { value: "ai_cred_story" } });
    fireEvent.click(within(dialog).getByTestId("engine-save"));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({ enabled: true, provider: "mock", model: "story-1", credentials_ref: "AI_CRED_STORY", safety_level: "strict", endpoint: null });
  });

  it("is admin only and RTL in Hebrew", async () => {
    mockFetch({ "GET /api/admin/ai/engines": { body: data }, "GET /api/admin/ai/requests": { body: { requests: [] } } });
    renderApp({ routes, url: "/admin/ai", user: { ...me, language: "he" }, locale: "he" });
    expect(await screen.findByRole("heading", { name: "מנועי בינה מלאכותית" })).toBeTruthy();
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("is not offered to teachers", async () => {
    mockFetch({});
    renderApp({ routes, url: "/admin/ai", user: teacher });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "AI engines" })).toBeNull());
  });
});

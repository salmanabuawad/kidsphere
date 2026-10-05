import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { adam, options } from "@/features/observations/testData";
import type { FocusArea } from "./api";
import { routes } from "./routes";

const PLAN = {
  strength_used: "Imagination and building",
  need: "Joining other children's play",
  adaptation: "Start in a pair at the block corner",
  what_we_will_do: "Build the garage together",
  success_looks_like: "Invites a friend to build without prompting",
};

const focus = (over: Partial<FocusArea>): FocusArea => ({
  id: "f1",
  child_id: "c1",
  category: "social",
  suggestion_key: "joining_group_play",
  title: "Joining group play",
  description: null,
  plan: null,
  status: "active",
  close_reason: null,
  created_at: "2026-09-01T10:00:00Z",
  closed_at: null,
  ...over,
});

const active = focus({ plan: PLAN });
const paused = focus({ id: "f2", title: "Taking turns", suggestion_key: "taking_turns", status: "paused", closed_at: "2026-09-20T10:00:00Z" });
const done = focus({ id: "f3", title: "Saying goodbye", suggestion_key: null, status: "completed", closed_at: "2026-09-10T10:00:00Z" });

function setup(list: FocusArea[], extra: Parameters<typeof mockFetch>[0] = {}) {
  const fetchFn = mockFetch({
    "GET /api/children/c1": { body: { child: adam } },
    "GET /api/children/c1/focus-areas": { body: { focus_areas: list, max_active: 3 } },
    ...extra,
  });
  renderApp({ routes, url: "/children/c1/focus", user: teacher, options });
  return fetchFn;
}

describe("FocusPage", () => {
  it("shows active, paused and completed focus areas and the plan as 5 labelled steps", async () => {
    setup([active, paused, done]);
    expect((await screen.findByTestId("focus-count")).textContent).toBe("1 of 3 active");
    expect(screen.getByText(/Up to 3 at a time/)).toBeTruthy();

    const card = screen.getByTestId("focus-card");
    expect(within(card).getByText("Joining group play")).toBeTruthy();
    const labels = ["Strength used", "Need", "Adaptation", "What we will do", "Follow-up: how we will know it is helping"];
    const steps = ["strength_used", "need", "adaptation", "what_we_will_do", "success_looks_like"] as const;
    steps.forEach((k, i) => {
      const step = within(card).getByTestId(`plan-step-${k}`);
      expect(step.textContent).toContain(labels[i]);
      expect(step.textContent).toContain(PLAN[k]);
    });
    expect(within(screen.getByRole("region", { name: "Paused" })).getByText("Taking turns")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Completed" })).getByText("Saying goodbye")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d+\s*%|score|points/i);
  });

  it("marks empty plan steps and links Create content to growth support for this focus", async () => {
    setup([focus({})]);
    const card = await screen.findByTestId("focus-card");
    expect(within(card).getAllByText("Not written yet")).toHaveLength(5);
    expect(within(card).getByRole("link", { name: /Create content/ }).getAttribute("href")).toBe("/children/c1/content/new?mode=growth_support&focus=f1");
  });

  it("disables adding at 3 active and explains why", async () => {
    setup([active, focus({ id: "f4", title: "B" }), focus({ id: "f5", title: "C" })]);
    expect((await screen.findByTestId("focus-count")).textContent).toBe("3 of 3 active");
    expect(screen.getByText(/Pause or complete one to add another/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add focus" }).hasAttribute("disabled")).toBe(true);
  });

  it("pauses an active focus", async () => {
    let body: unknown = null;
    setup([active], {
      "POST /api/focus-areas/f1/close": (init) => {
        body = JSON.parse(String(init?.body));
        return { body: { focus_area: { ...active, status: "paused", closed_at: "2026-10-05T10:00:00Z" } } };
      },
    });
    const card = await screen.findByTestId("focus-card");
    fireEvent.click(within(card).getByRole("button", { name: "Pause" }));
    const pausedSection = await screen.findByRole("region", { name: "Paused" });
    expect(within(pausedSection).getByText("Joining group play")).toBeTruthy();
    expect(body).toEqual({ status: "paused" });
    expect(screen.getByTestId("focus-count").textContent).toBe("0 of 3 active");
  });

  it("shows a friendly message when reactivating would exceed 3 active", async () => {
    setup([active, focus({ id: "f4", title: "B" }), focus({ id: "f5", title: "C" }), paused], {
      "PUT /api/focus-areas/f2": { status: 409, body: { error: { code: "FOCUS_LIMIT", message: "limit" } } },
    });
    const section = await screen.findByRole("region", { name: "Paused" });
    fireEvent.click(within(section).getByRole("button", { name: "Make active again" }));
    expect(await screen.findByText("There are already 3 active focus areas. Pause or complete one first.")).toBeTruthy();
  });

  it("adds a focus from the suggestions", async () => {
    let body: unknown = null;
    setup([], {
      "POST /api/children/c1/focus-areas": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { focus_area: focus({ id: "f9", title: "Taking turns", suggestion_key: "taking_turns" }) } };
      },
    });
    expect(await screen.findByText("No active focus yet")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Add focus" })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Taking turns" }));
    await waitFor(() => expect(screen.getByTestId("focus-card").textContent).toContain("Taking turns"));
    expect(body).toEqual({ suggestion_key: "taking_turns", title: "Taking turns" });
  });

  it("renders RTL in Hebrew", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/focus-areas": { body: { focus_areas: [active], max_active: 3 } },
    });
    renderApp({ routes, url: "/children/c1/focus", user: { ...teacher, language: "he" }, locale: "he", options });
    expect((await screen.findByTestId("focus-count")).textContent).toBe("1 מתוך 3 פעילים");
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(screen.getByText("החוזקה שנשען עליה")).toBeTruthy();
  });
});

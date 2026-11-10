import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppRoute } from "@/lib/routing";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { NextStepsCard, type NextFocus } from "./NextStepsCard";

const routes: AppRoute[] = [{ path: "/x", element: <NextStepsCard childId="c1" /> }];

const focus: NextFocus = {
  focus_area_id: "f1",
  title: "Naming feelings",
  category: "emotional",
  suggestion_key: "naming_feelings",
  signal: "repeat",
  facts: [
    { kind: "home_reflection", at: "2026-11-02T18:00:00Z", result: "partly", support_level: null, content_title: "At Home Together", content_type: "home_activity", reported_by: "parent" },
  ],
  suggestions: [
    { content_type: "real_world_activity", mode: "growth_support" },
    { content_type: "home_activity", mode: "growth_support" },
  ],
  library: [{ id: "l1", title: "Lulu and the feelings", content_type: "story", language: "ar" }],
};

describe("NextStepsCard", () => {
  it("shows the facts apart from the suggestion, with a reason and pre-filled links", async () => {
    mockFetch({ "GET /api/children/c1/next-steps": { body: { focus_areas: [focus] } } });
    renderApp({ routes, url: "/x", user: teacher });
    expect(await screen.findByTestId("next-steps")).toBeTruthy();
    expect(screen.getByText("From home (parent):")).toBeTruthy();
    expect(screen.getByTestId("next-step-reason").textContent).toContain("It partly worked");
    const link = screen.getByRole("link", { name: "Create: Real-world activity" });
    expect(link.getAttribute("href")).toBe("/children/c1/content/new?mode=growth_support&focus=f1&type=real_world_activity");
    expect(screen.getByRole("link", { name: "Lulu and the feelings" }).getAttribute("href")).toBe("/library/l1");
    expect(document.body.textContent).not.toMatch(/\d+\s*%|\bscore\b|\bpoints\b/i);
  });

  it("renders nothing without active focus areas", async () => {
    const fetchMock = mockFetch({ "GET /api/children/c1/next-steps": { body: { focus_areas: [] } } });
    renderApp({ routes, url: "/x", user: teacher });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("next-steps")).toBeNull();
  });
});

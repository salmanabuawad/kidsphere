import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routes as parentRoutes } from "@/features/parent/routes";
import { mockFetch, parent, renderApp } from "@/test/utils";
import type { ContentDetail } from "./api";

const home = {
  title: "At Home Together: The Little Red Car and Me",
  goal: "A short, playful time together that helps Adam give each feeling a name.",
  duration_minutes: 10,
  materials: ["Toy cars", "A cushion or a soft toy"],
  steps: ["Choose a calm moment of about ten minutes, with no screens around.", "Play with toy cars together."],
  words_to_try: ["I feel happy. I feel sad. I feel angry.", "I see you. I am here with you."],
  what_to_notice: ["What did Adam enjoy most?"],
  if_it_feels_hard: "Keep it short and playful.",
  parent_tip: "There is no right or wrong way to play.",
};

const shared: ContentDetail = {
  id: "h1",
  child_id: "c1",
  pack_id: null,
  content_type: "home_activity",
  template: null,
  language: "en",
  title: home.title,
  status: "approved",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  approved_at: "2026-11-01T10:00:00Z",
  video_status: null,
  video_url: null,
  content: home as unknown as Record<string, unknown>,
} as ContentDetail;

const NO_SCORES = /\d+\s*%|\bscore\b|\bpoints\b/i;

describe("Home activity for parents", () => {
  it("shows the plan in plain words and lets the parent say how it went", async () => {
    let posted: unknown = null;
    const reflections: unknown[] = [];
    const fetchMock = mockFetch({
      "GET /api/content/h1": { body: { content: shared } },
      "GET /api/content/h1/home-reflections": () => ({ body: { reflections } }),
      "POST /api/content/h1/home-reflections": (init) => {
        posted = JSON.parse(String(init?.body));
        const r = { id: "r1", content_id: "h1", child_id: "c1", result: "partly", note: "He wanted to stop early.", created_at: "2026-11-02T18:00:00Z", by_name: "Dana Levi" };
        reflections.push(r);
        return { status: 201, body: { reflection: r } };
      },
    });
    renderApp({ routes: parentRoutes, url: "/parent/content/h1", user: parent });
    expect(await screen.findByTestId("home-activity-card")).toBeTruthy();
    expect(screen.getByText("Words you can try")).toBeTruthy();
    expect(screen.getByText("I feel happy. I feel sad. I feel angry.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_SCORES);

    const card = await screen.findByTestId("home-reflection");
    const send = screen.getByRole("button", { name: "Send to the teacher" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Partly/ }));
    fireEvent.change(card.querySelector("textarea")!, { target: { value: "He wanted to stop early." } });
    fireEvent.click(send);
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({ result: "partly", note: "He wanted to stop early." });
    expect(typeof (posted as { client_request_id: unknown }).client_request_id).toBe("string");
    expect(await screen.findByTestId("home-reflection-list")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("is shown right to left in Arabic", async () => {
    mockFetch({
      "GET /api/content/h1": { body: { content: { ...shared, language: "ar" } } },
      "GET /api/content/h1/home-reflections": { body: { reflections: [] } },
    });
    renderApp({ routes: parentRoutes, url: "/parent/content/h1", user: { ...parent, language: "ar" }, locale: "ar" });
    const card = await screen.findByTestId("home-activity-card");
    expect(card.getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("كيف جرى الأمر في البيت؟")).toBeTruthy();
  });
});

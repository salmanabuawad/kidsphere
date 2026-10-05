import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockFetch, renderApp, teacher, type Handler } from "@/test/utils";
import { adam, options } from "@/features/observations/testData";
import type { CurrentUnderstandingResponse, DraftContext, Review, ReviewInput, ReviewsResponse, SuggestResponse } from "./api";
import { blankDraft, buildPayload, projectedActive } from "./ReviewPage";
import { routes } from "./routes";

const SCORING = /\d+\s*%|\bscore\b|\bpoints\b/i;
const SUMMARY = "Adam appears to be becoming more independent in initiating shared play.";

const focus = (id: string, title: string, observation_count = 2) => ({
  id,
  category: "social",
  suggestion_key: null,
  title,
  description: null,
  plan: null,
  status: "active",
  created_at: "2026-09-01T10:00:00Z",
  observation_count,
});

const context: DraftContext = {
  baseline: { id: "b1", created_at: "2026-09-01T10:00:00Z", summary: "Adam appears to enjoy cars and blocks." },
  observation_count_since_baseline: 2,
  max_active: 3,
  focus_areas: [focus("f1", "Joining group play")],
  baseline_items: [
    { list: "strengths", key: "building", custom: null, label: "Building" },
    { list: "interests", key: "cars_transportation", custom: null, label: "Cars & transportation" },
    { list: "focus", key: "f1", custom: null, label: "Joining group play" },
  ],
};

const review: Review = {
  id: "r1",
  child_id: "c1",
  review_date: "2026-10-01",
  summary: SUMMARY,
  understanding: { summary: SUMMARY, strengths: [{ key: "building" }], interests: [], what_helps: [], areas_for_support: [], adaptations: null, next_steps: null },
  focus_review: [
    { focus_area_id: "f1", title: "Joining group play", status: "some_improvement", decision: "keep", what_worked: "Building first", what_to_change: null, note: null },
  ],
  baseline_validation: [
    { list: "strengths", key: "building", custom: null, label: "Building", status: "supported", note: null, observation_ids: ["o1", "o2", "o3"] },
    { list: "interests", key: "cars_transportation", custom: null, label: "Cars & transportation", status: "needs_more_observation", note: null, observation_ids: ["o1"] },
  ],
  ai_suggested: true,
  created_by: { id: "u1", name: "Rana" },
  created_at: "2026-10-01T10:00:00Z",
};

const understanding: CurrentUnderstandingResponse = {
  current_understanding: {
    summary: SUMMARY,
    strengths: [{ key: "building", sources: ["teacher", "review"] }],
    interests: [{ key: "cars_transportation" }, { custom: "Trains" }],
    what_helps: [{ key: "adult_mediation", list: "what_helps" }],
    areas_for_support: ["Starting shared play"],
    adaptations: "Start with one friend.",
    next_steps: "Invite one friend to build together.",
    source: "review",
    review_id: "r1",
    review_date: "2026-10-01",
    approved_by: "u1",
    approved_by_name: "Rana",
    approved_at: "2026-10-01T10:00:00Z",
  },
  baseline: {
    id: "b1",
    created_at: "2026-09-01T10:00:00Z",
    created_by: { id: "u1", name: "Rana" },
    summary: {
      strengths: [{ key: "building", sources: ["teacher"] }],
      interests: [{ key: "cars_transportation", sources: ["parent"] }],
      what_helps: [],
      support_needs: { independence: [{ area: "dressing", level: "some_support", reported_by: "teacher" }] },
      focus_areas: [{ id: "f1", title: "Joining group play", category: "social" }],
    },
  },
};

const suggestion: SuggestResponse = {
  ...context,
  provider: "template",
  is_template: true,
  suggestion: {
    summary: "Adam appears to enjoy cars. Only a few observations so far.",
    strengths: [{ key: "building", custom: null, label: "Building" }],
    interests: [{ key: "cars_transportation", custom: null, label: "Cars & transportation" }],
    what_helps: [],
    areas_for_support: ["Joining group play"],
    adaptations: "Start with one friend.",
    next_steps: "Keep observing during free play.",
    baseline_validation: [
      { list: "strengths", key: "building", custom: null, label: "Building", status: "needs_more_observation", note: "Keep observing.", observation_ids: [] },
      { list: "focus", key: "f1", custom: null, label: "Joining group play", status: "needs_more_observation", note: "Keep observing.", observation_ids: ["o1", "o2"] },
    ],
    focus_review: [{ focus_area_id: "f1", status: "needs_more_observation", note: "Only one or two observations so far." }],
  },
};

function developmentHandlers(over: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    "GET /api/children/c1": { body: { child: adam } },
    "GET /api/children/c1/current-understanding": { body: understanding },
    "GET /api/children/c1/baseline": {
      body: { latest: { id: "b1", created_at: "2026-09-01T10:00:00Z", created_by: { id: "u1", name: "Rana" }, baseline_data: {} }, earlier: [{ id: "b0", created_at: "2026-08-01T10:00:00Z", created_by: { id: "u1", name: "Rana" } }] },
    },
    "GET /api/children/c1/development-reviews": { body: { reviews: [review], context } satisfies ReviewsResponse },
    ...over,
  };
}

describe("DevelopmentPage", () => {
  it("shows the baseline next to the current understanding, validation in words and past reviews", async () => {
    mockFetch(developmentHandlers());
    renderApp({ routes, url: "/children/c1/development", user: teacher, options });

    const baselineCard = await screen.findByTestId("baseline-card");
    expect(within(baselineCard).getByText("Initial baseline")).toBeTruthy();
    expect(within(baselineCard).getByText("Building")).toBeTruthy();
    expect(within(baselineCard).getByText("Adam appears to enjoy cars and blocks.")).toBeTruthy();
    expect(within(baselineCard).getAllByText(/Saved on .* by Rana/)).toHaveLength(2); // latest + one earlier baseline
    expect(within(baselineCard).getByText("Joining group play")).toBeTruthy();
    expect(within(baselineCard).getByText("Earlier baselines")).toBeTruthy();

    const current = screen.getByTestId("understanding-card");
    expect(within(current).getByText(SUMMARY)).toBeTruthy();
    expect(within(current).getByText(/Approved by Rana on/)).toBeTruthy();
    expect(within(current).getByText("Trains")).toBeTruthy();
    expect(within(current).getByText("Adult guidance")).toBeTruthy();
    expect(within(current).getByText("Starting shared play")).toBeTruthy();

    const validation = screen.getByTestId("validation-card");
    expect(within(validation).getByText("Supported")).toBeTruthy();
    expect(within(validation).getByText("Needs more observation")).toBeTruthy();
    expect(within(validation).getByText("Based on 3 observations")).toBeTruthy();
    expect(within(validation).getByText("Based on 1 observation — keep observing")).toBeTruthy();

    const item = screen.getByTestId("review-item");
    expect(within(item).getByText(SUMMARY)).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: "Show details" }));
    expect(within(item).getByText("Some improvement")).toBeTruthy();
    expect(within(item).getByText("Keep")).toBeTruthy();

    expect(screen.getByRole("link", { name: "Review development" }).getAttribute("href")).toBe("/children/c1/review/new");
    expect(document.body.textContent).not.toMatch(SCORING);
  });

  it("creates a new baseline after confirming", async () => {
    let posted = 0;
    mockFetch(
      developmentHandlers({
        "POST /api/children/c1/baseline": () => {
          posted += 1;
          return { status: 201, body: { baseline: { id: "b2", created_at: "2026-10-05T10:00:00Z", created_by: null } } };
        },
      }),
    );
    renderApp({ routes, url: "/children/c1/development", user: teacher, options });
    fireEvent.click(await screen.findByRole("button", { name: "Create new baseline" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create baseline" }));
    await waitFor(() => expect(posted).toBe(1));
    expect(await screen.findByText("New baseline saved")).toBeTruthy();
  });

  it("renders RTL in Arabic", async () => {
    mockFetch(developmentHandlers());
    renderApp({ routes, url: "/children/c1/development", user: { ...teacher, language: "ar" }, locale: "ar", options });
    expect(await screen.findByText("نقطة البداية")).toBeTruthy();
    expect(screen.getByText("الفهم الحالي", { selector: "h2" })).toBeTruthy();
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByText("تدعمه الملاحظات")).toBeTruthy();
  });
});

describe("ReviewPage", () => {
  it("suggests, lets the teacher decide and approves; warnings show politely afterwards", async () => {
    let saved: ReviewInput | null = null;
    let suggestBody: unknown = null;
    mockFetch(
      developmentHandlers({
        "POST /api/children/c1/development-reviews/suggest": (init) => {
          suggestBody = JSON.parse(String(init?.body));
          return { body: suggestion };
        },
        "POST /api/children/c1/development-reviews": (init) => {
          saved = JSON.parse(String(init?.body)) as ReviewInput;
          return {
            status: 201,
            body: {
              review,
              current_understanding: understanding.current_understanding,
              warnings: [{ code: "LIMITED_OBSERVATIONS", path: "focus_review.0.status", focus_area_id: "f1", title: "Joining group play", observation_count: 2 }],
            },
          };
        },
      }),
    );
    renderApp({ routes, url: "/children/c1/review/new", user: teacher, options });

    expect(await screen.findByText(/^2 observations since the baseline of /)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Suggest a summary" }));
    expect(await screen.findByText("Made with templates")).toBeTruthy();
    expect(suggestBody).toEqual({ language: "en" });

    const card = screen.getByTestId("focus-review");
    expect(within(card).getByText("Based on 2 observations — keep observing")).toBeTruthy();
    const status = within(card).getByRole("group", { name: "How is it going?" });
    expect(within(status).getByRole("button", { name: /Needs more observation/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(status).getByRole("button", { name: /Improving/ }));
    expect(within(card).getByText(/rests on only a few observations/)).toBeTruthy();
    fireEvent.change(within(card).getByLabelText("What worked"), { target: { value: "Building first" } });

    expect((screen.getByLabelText(/^Summary/) as HTMLTextAreaElement).value).toBe(suggestion.suggestion.summary);
    const items = screen.getAllByTestId("validation-item");
    expect(items).toHaveLength(3);
    expect(within(items[2]!).getByText("Based on 2 observations — keep observing")).toBeTruthy();
    fireEvent.click(within(items[0]!).getByRole("button", { name: /Partly supported/ }));

    fireEvent.click(screen.getByRole("button", { name: "Approve and save" }));
    await waitFor(() => expect(saved).not.toBeNull());
    const body = saved as unknown as ReviewInput;
    expect(body.ai_suggested).toBe(true);
    expect(body.summary).toBe(suggestion.suggestion.summary);
    expect(body.focus_review).toEqual([
      { focus_area_id: "f1", status: "improving", decision: "keep", what_worked: "Building first", note: "Only one or two observations so far." },
    ]);
    expect(body.baseline_validation.map((v) => [v.list, v.status, v.observation_ids.length])).toEqual([
      ["strengths", "partially_supported", 0],
      ["interests", "needs_more_observation", 0],
      ["focus", "needs_more_observation", 2],
    ]);
    expect(body.understanding.strengths).toEqual([{ key: "building" }]);
    expect(body.understanding.areas_for_support).toEqual(["Joining group play"]);

    // Back on the development page with a calm note about limited data.
    const note = (await screen.findByText("Saved. Some choices rest on only a few observations")).closest("[role=status]")!;
    expect(note.textContent).toContain("Joining group play — Based on 2 observations — keep observing");
    expect(document.body.textContent).not.toMatch(SCORING);
  });

  it("starts blank, respects the 3-focus limit and needs a summary", async () => {
    let saved: ReviewInput | null = null;
    const full: DraftContext = { ...context, focus_areas: [focus("f1", "Joining group play"), focus("f2", "Taking turns", 0), focus("f3", "Calming down", 4)] };
    mockFetch(
      developmentHandlers({
        "GET /api/children/c1/development-reviews": { body: { reviews: [], context: full } },
        "POST /api/children/c1/development-reviews": (init) => {
          saved = JSON.parse(String(init?.body)) as ReviewInput;
          return { status: 201, body: { review, current_understanding: understanding.current_understanding, warnings: [] } };
        },
      }),
    );
    renderApp({ routes, url: "/children/c1/review/new", user: teacher, options });
    fireEvent.click(await screen.findByRole("button", { name: "Write it myself" }));

    const cards = screen.getAllByTestId("focus-review");
    expect(cards).toHaveLength(3);
    expect(within(cards[1]!).getByText("No linked observations yet — keep observing")).toBeTruthy();
    expect(within(cards[2]!).getByText("Based on 4 observations")).toBeTruthy();
    const add = screen.getByRole("button", { name: "Add a new focus" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText("Up to 3 focus areas at a time. Pause or close one to add another.")).toBeTruthy();

    // Lists start from the current understanding.
    expect(within(screen.getByTestId("items-interests")).getByRole("button", { name: "Remove Trains" })).toBeTruthy();

    fireEvent.click(within(within(cards[1]!).getByRole("group", { name: "What next?" })).getByRole("button", { name: "Pause" }));
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    fireEvent.click(within(screen.getByTestId("add-focus")).getByRole("button", { name: "Expressing frustration in words" }));
    expect(screen.getByTestId("new-focus").textContent).toContain("Expressing frustration in words");
    expect((screen.getByRole("button", { name: "Add a new focus" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Approve and save" }));
    expect(await screen.findByText("Please write a short summary first.")).toBeTruthy();
    expect(saved).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Summary/), { target: { value: "  Adam appears to enjoy building with one friend.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Approve and save" }));
    await waitFor(() => expect(saved).not.toBeNull());
    const body = saved as unknown as ReviewInput;
    expect(body.ai_suggested).toBe(false);
    expect(body.summary).toBe("Adam appears to enjoy building with one friend.");
    expect(body.focus_review.map((f) => [f.focus_area_id, f.decision, f.status])).toEqual([
      ["f1", "keep", "needs_more_observation"],
      ["f2", "pause", "needs_more_observation"],
      ["f3", "keep", "needs_more_observation"],
      [undefined, "create", undefined],
    ]);
    expect(body.focus_review[3]!.create).toEqual({ suggestion_key: "expressing_frustration_in_words", title: "Expressing frustration in words" });
    expect(body.understanding.interests).toEqual([{ key: "cars_transportation" }, { custom: "Trains" }]);
    expect(body.understanding.what_helps).toEqual([{ key: "adult_mediation", list: "what_helps" }]);
  });

  it("asks for everyday words when the server finds a label", async () => {
    mockFetch(
      developmentHandlers({
        "POST /api/children/c1/development-reviews": {
          status: 422,
          body: { error: { code: "UNSAFE_CONTENT", message: "x", details: [{ path: "summary", message: "uses a clinical term" }] } },
        },
      }),
    );
    renderApp({ routes, url: "/children/c1/review/new", user: teacher, options });
    fireEvent.click(await screen.findByRole("button", { name: "Write it myself" }));
    fireEvent.change(screen.getByLabelText(/^Summary/), { target: { value: "Some text" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve and save" }));
    expect(await screen.findByText("Please describe what you see in everyday, observational words, without labels.")).toBeTruthy();
  });
});

describe("review payload helpers", () => {
  it("builds edit and create entries and counts active focus areas", () => {
    const d = blankDraft(context, understanding.current_understanding);
    d.understanding.summary = "Summary";
    d.focus[0] = { ...d.focus[0]!, decision: "edit", editTitle: "Joining play with one friend", editDescription: "" };
    d.added = [{ uid: "n1", category: "social", title: "Sharing toys" }];
    expect(projectedActive(d)).toBe(2);
    const p = buildPayload(d);
    expect(p.focus_review[0]).toMatchObject({ decision: "edit", edit: { title: "Joining play with one friend", description: null } });
    expect(p.focus_review[1]).toEqual({ decision: "create", create: { category: "social", title: "Sharing toys" } });
    expect(p.baseline_validation.every((v) => v.status === "needs_more_observation")).toBe(true);
  });
});

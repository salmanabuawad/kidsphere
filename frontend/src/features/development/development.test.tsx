import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockFetch, renderApp, teacher, type Handler } from "@/test/utils";
import { adam, options } from "@/features/observations/testData";
import { planOptions } from "@/features/focus/testData";
import arDevelopment from "@/i18n/messages/ar/development.json";
import type { CurrentUnderstandingResponse, DraftContext, FunctionalSummary, Review, ReviewInput, ReviewsResponse, SuggestResponse, SummariesResponse, SummaryInput } from "./api";
import { blankDraft, buildPayload, projectedActive, suggestedDraft } from "./ReviewPage";
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
    "GET /api/children/c1/functional-summaries": { body: { latest_approved: null, drafts: [], history: [], ai_drafts: {} } satisfies SummariesResponse },
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

// --------------------------------------------------------------------------- WP2-PLAN: follow-up, summary, understanding over time

const summaryRow = (over: Partial<FunctionalSummary>): FunctionalSummary => ({
  id: "s1",
  child_id: "c1",
  supersedes_id: null,
  superseded_by: null,
  review_id: null,
  assessment_id: null,
  general_description: "Adam enjoys building with one friend.",
  main_strengths: { items: [{ key: "building" }], text: null },
  main_needs: { items: ["Starting shared play"], text: null },
  adaptations: "Start at the block corner.",
  follow_up_with_parents: "Share the building game at home.",
  team_recommendations: "Offer a building role at group time.",
  source: "manual",
  ai_suggestion_id: null,
  status: "approved",
  approved_by: { id: "u1", name: "Rana" },
  approved_at: "2026-10-02T10:00:00Z",
  created_by: { id: "u1", name: "Rana" },
  created_at: "2026-10-02T09:00:00Z",
  provenance: [{ label: "teacher_approved" }],
  ...over,
});

describe("Review follow-up (Domain 16)", () => {
  it("starts empty even after a suggestion and saves every follow-up field with the suggestion id", async () => {
    let saved: ReviewInput | null = null;
    mockFetch(
      developmentHandlers({
        "POST /api/children/c1/development-reviews/suggest": { body: { ...suggestion, suggestion_id: "ais-1" } },
        "POST /api/children/c1/development-reviews": (init) => {
          saved = JSON.parse(String(init?.body)) as ReviewInput;
          return {
            status: 201,
            body: { review, current_understanding: understanding.current_understanding, warnings: [{ code: "WORDING", path: "follow_up.involvement.note", message: "x" }] },
          };
        },
      }),
    );
    renderApp({ routes, url: "/children/c1/review/new", user: teacher, options: planOptions });
    fireEvent.click(await screen.findByRole("button", { name: "Suggest a summary" }));
    const step = await screen.findByTestId("follow-up-step");
    expect((within(step).getByLabelText(/When we will look again/) as HTMLInputElement).value).toBe("");
    expect(within(step).queryAllByRole("radio", { checked: true })).toHaveLength(0);

    fireEvent.change(within(step).getByLabelText(/When we will look again/), { target: { value: "2026-12-15" } });
    const improvement = within(step).getByRole("radiogroup", { name: "Has anything changed overall?" });
    fireEvent.click(within(improvement).getByRole("radio", { name: /Partial improvement/ }));
    fireEvent.change(within(step).getByLabelText(/Tell a bit more/), { target: { value: "Joins one friend" } });
    fireEvent.click(within(step).getByRole("button", { name: /Social/ }));
    fireEvent.click(within(step).getByRole("button", { name: "Joining group play" }));
    fireEvent.change(within(step).getByLabelText("What worked well?"), { target: { value: "Building first" } });
    fireEvent.change(within(step).getByLabelText("What needs to change?"), { target: { value: "Shorter group time" } });
    const involvement = within(step).getByRole("radiogroup", { name: "Next step with the family or the team" });
    fireEvent.click(within(involvement).getByRole("radio", { name: "Involve a specialist if needed" }));
    fireEvent.change(within(step).getByLabelText(/Details/), { target: { value: "Talk with the family first" } });

    fireEvent.click(screen.getByRole("button", { name: "Approve and save" }));
    await waitFor(() => expect(saved).not.toBeNull());
    const body = saved as unknown as ReviewInput;
    expect(body.ai_suggestion_id).toBe("ais-1");
    expect(body.follow_up).toEqual({
      reassessment_on: "2026-12-15",
      improvement: { level: "partial", note: "Joins one friend" },
      areas: { domains: ["social"], focus_area_ids: ["f1"] },
      what_worked: "Building first",
      what_to_change: "Shorter group time",
      involvement: { key: "referral_as_needed", note: "Talk with the family first" },
    });
    expect(await screen.findByText(/The details of the next step use words we usually avoid/)).toBeTruthy();
  });

  it("sends no follow-up when it was left empty", () => {
    const d = blankDraft(context, understanding.current_understanding);
    d.understanding.summary = "Summary";
    expect(buildPayload(d).follow_up).toBeUndefined();
    expect(buildPayload(d).ai_suggestion_id).toBeUndefined();
  });
});

describe("Development tab: understanding over time, summary, original baseline", () => {
  function handlers(summaries: SummariesResponse, extra: Record<string, Handler> = {}) {
    return developmentHandlers({
      "GET /api/children/c1/baseline": {
        body: {
          latest: {
            id: "b1",
            created_at: "2026-09-01T10:00:00Z",
            created_by: { id: "u1", name: "Rana" },
            original: false,
            baseline_data: { strengths: [{ key: "building" }, { custom: "Tells long stories" }], interests: [], what_helps: [], focus_areas: [] },
          },
          earlier: [{ id: "b0", created_at: "2026-08-01T10:00:00Z", created_by: { id: "u1", name: "Rana" }, original: true }],
          original_id: "b0",
          count: 2,
        },
      },
      "GET /api/children/c1/baselines/b0": {
        body: {
          baseline: {
            id: "b0",
            child_id: "c1",
            created_at: "2026-08-01T10:00:00Z",
            created_by: { id: "u1", name: "Rana" },
            original: true,
            latest: false,
            number: 1,
            count: 2,
            summary: "Adam appears to enjoy cars.",
            baseline_data: {
              strengths: [{ key: "building" }, { key: "imagination" }],
              interests: [],
              what_helps: [],
              focus_areas: [{ id: "f1", title: "Joining group play", category: "social" }],
            },
          },
        },
      },
      "GET /api/children/c1/functional-summaries": { body: summaries },
      ...extra,
    });
  }

  it("shows the understanding over time and compares the original baseline with the latest", async () => {
    mockFetch(handlers({ latest_approved: null, drafts: [], history: [], ai_drafts: {} }));
    renderApp({ routes, url: "/children/c1/development", user: teacher, options: planOptions });
    const timeline = await screen.findByTestId("understanding-timeline");
    await waitFor(() => expect(within(timeline).getAllByTestId("understanding-step")).toHaveLength(2));
    const steps = within(timeline).getAllByTestId("understanding-step");
    expect(steps[0]!.textContent).toContain("First picture (original baseline)");
    expect(steps[0]!.textContent).toContain("Adam appears to enjoy cars.");
    expect(steps[1]!.getAttribute("data-current")).toBe("true");
    expect(within(steps[1]!).getByText("Teacher approved")).toBeTruthy();
    expect(steps[1]!.textContent).toContain("Approved by Rana");

    const compare = await screen.findByTestId("baseline-compare");
    const original = within(compare).getByTestId("compare-original");
    const latest = within(compare).getByTestId("compare-latest");
    expect(within(original).getByText("Imagination").closest("li")!.getAttribute("data-marker")).toBe("gone");
    expect(within(latest).getByText("Tells long stories").closest("li")!.getAttribute("data-marker")).toBe("new");
    expect(within(latest).getByText("New since the original")).toBeTruthy();
    expect(within(original).getByText("Joining group play")).toBeTruthy();
    expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === "/children/c1/development/timeline")).toBe(true);
    expect(document.body.textContent).not.toMatch(SCORING);
  });

  it("shows the approved summary and a draft, approves the draft and keeps the history", async () => {
    let approved = 0;
    const draft = summaryRow({
      id: "s2",
      supersedes_id: "s1",
      status: "draft",
      source: "ai_draft",
      ai_suggestion_id: "ais-9",
      approved_by: null,
      approved_at: null,
      provenance: [{ label: "ai_suggested" }],
      general_description: "Adam builds with friends.",
    });
    mockFetch(
      handlers(
        { latest_approved: summaryRow({}), drafts: [draft], history: [draft, summaryRow({ superseded_by: "s2" })], ai_drafts: {} },
        {
          "POST /api/functional-summaries/s2/approve": () => {
            approved += 1;
            return { body: { summary: { ...draft, status: "approved" } } };
          },
        },
      ),
    );
    renderApp({ routes, url: "/children/c1/development", user: teacher, options: planOptions });
    const card = await screen.findByTestId("summary-card");
    const approvedPart = await within(card).findByTestId("summary-approved");
    expect(within(approvedPart).getByText("Teacher approved")).toBeTruthy();
    expect(within(approvedPart).getByText(/Approved by Rana on/)).toBeTruthy();
    expect(within(approvedPart).getByTestId("summary-main_needs").textContent).toContain("Starting shared play");
    expect(within(approvedPart).getByTestId("summary-follow_up_with_parents").textContent).toContain("Share the building game at home.");
    const draftPart = within(card).getByTestId("summary-draft");
    expect(within(draftPart).getByText("AI suggested")).toBeTruthy();
    expect(within(draftPart).getByText("Adam builds with friends.")).toBeTruthy();
    fireEvent.click(within(draftPart).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(approved).toBe(1));

    fireEvent.click(within(card).getByRole("button", { name: "Earlier versions" }));
    expect(within(card).getByTestId("summary-history").querySelectorAll("li")).toHaveLength(2);
  });

  it("drafts with AI, compares with the draft and saves a new version", async () => {
    let posted: SummaryInput | null = null;
    const aiDraft = {
      general_description: "Adam enjoys building.",
      main_strengths: { items: [{ key: "building" }], text: null },
      main_needs: { items: ["Joining a group"], text: null },
      adaptations: "One friend first.",
      follow_up_with_parents: null,
      team_recommendations: "Offer a role.",
    };
    mockFetch(
      handlers(
        { latest_approved: summaryRow({}), drafts: [], history: [summaryRow({})], ai_drafts: {} },
        {
          "POST /api/children/c1/functional-summaries/suggest": {
            body: { draft: aiDraft, suggestion_id: "ais-2", provider: "template", is_template: true, possible_patterns: [], next_observation_questions: [] },
          },
          "POST /api/children/c1/functional-summaries": (init) => {
            posted = JSON.parse(String(init?.body)) as SummaryInput;
            return { status: 201, body: { summary: summaryRow({ id: "s3", status: "draft", source: "ai_draft", ai_suggestion_id: "ais-2" }) } };
          },
        },
      ),
    );
    renderApp({ routes, url: "/children/c1/development", user: teacher, options: planOptions });
    const card = await screen.findByTestId("summary-card");
    await within(card).findByTestId("summary-approved");
    fireEvent.click(within(card).getByRole("button", { name: "Draft with AI" }));
    const general = (await screen.findByLabelText("General description")) as HTMLTextAreaElement;
    expect(general.value).toBe("Adam enjoys building.");
    expect(screen.getByText(/without the child's name/)).toBeTruthy();
    fireEvent.change(general, { target: { value: "Adam enjoys building with one friend." } });
    fireEvent.click(screen.getByRole("button", { name: "Compare with the AI draft" }));
    expect(screen.getAllByTestId("ai-text")[0]!.textContent).toContain("Adam enjoys building.");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toEqual({
      general_description: "Adam enjoys building with one friend.",
      main_strengths: { items: [{ key: "building" }], text: null },
      main_needs: { items: ["Joining a group"], text: null },
      adaptations: "One friend first.",
      follow_up_with_parents: null,
      team_recommendations: "Offer a role.",
      source: "ai_draft",
      ai_suggestion_id: "ais-2",
      supersedes_id: "s1",
    });
  });

  it("renders the new sections in Hebrew", async () => {
    mockFetch(handlers({ latest_approved: summaryRow({}), drafts: [], history: [summaryRow({})], ai_drafts: {} }));
    renderApp({ routes, url: "/children/c1/development", user: { ...teacher, language: "he" }, locale: "he", options: planOptions });
    expect(await screen.findByText("ההבנה לאורך זמן")).toBeTruthy();
    expect(await screen.findByText("סיכום קצר")).toBeTruthy();
    expect(await screen.findByText("תמונת הפתיחה המקורית והאחרונה")).toBeTruthy();
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("renders the review follow-up in Arabic", async () => {
    mockFetch(developmentHandlers());
    renderApp({ routes, url: "/children/c1/review/new", user: { ...teacher, language: "ar" }, locale: "ar", options: planOptions });
    fireEvent.click(await screen.findByRole("button", { name: arDevelopment.review.start.blank }));
    expect(await screen.findByText("4. المتابعة")).toBeTruthy();
    expect(screen.getByText("إشراك مختص عند الحاجة")).toBeTruthy();
    expect(document.documentElement.dir).toBe("rtl");
  });
});

describe("Past reviews: follow-up and the AI draft", () => {
  const followUpReview: Review = {
    ...review,
    focus_review: [],
    baseline_validation: [],
    ai_suggested: true,
    ai_suggestion_id: "ais-9",
    understanding: { ...review.understanding, adaptations: "One friend at a time.", next_steps: "Build together twice a week." },
    follow_up: {
      reassessment_on: "2026-12-15",
      improvement: { level: "partial", note: "Joins one friend now" },
      areas: { domains: ["social", "play"], focus_area_ids: ["f1"], text: "Mostly in free play" },
      what_worked: "Starting with blocks",
      what_to_change: "Shorter group time",
      involvement: { key: "joint_plan", note: "Talk at the next meeting" },
    },
  };
  const withTitle: Review = { ...review, id: "r0", focus_review: review.focus_review };

  it("shows every saved Domain 16 field after saving (and a details button for a follow-up only review)", async () => {
    mockFetch(developmentHandlers({
      "GET /api/children/c1/development-reviews": { body: { reviews: [followUpReview, withTitle], context } satisfies ReviewsResponse },
    }));
    renderApp({ routes, url: "/children/c1/development", user: teacher, options: planOptions });
    const item = (await screen.findAllByTestId("review-item"))[0]!;
    fireEvent.click(within(item).getByRole("button", { name: "Show details" }));
    const fu = within(item).getByTestId("review-follow-up");
    expect(within(item).getByText("Follow-up")).toBeTruthy();
    expect(within(fu).getByTestId("fu-reassessment").textContent).toMatch(/2026|15/);
    expect(within(fu).getByText("Partial improvement")).toBeTruthy();
    expect(within(fu).getByText("Joins one friend now")).toBeTruthy();
    expect(within(fu).getByText("Social")).toBeTruthy();
    expect(within(fu).getByText("Play")).toBeTruthy();
    expect(within(fu).getByText("Joining group play")).toBeTruthy(); // the goal's title
    expect(within(fu).getByText("Mostly in free play").getAttribute("dir")).toBe("auto");
    expect(within(fu).getByText("Starting with blocks")).toBeTruthy();
    expect(within(fu).getByText("Shorter group time")).toBeTruthy();
    expect(within(fu).getByText("Shared plan")).toBeTruthy();
    expect(within(fu).getByText("Talk at the next meeting")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(SCORING);
  });

  it("compares a saved review with the stored AI draft, marked AI suggested", async () => {
    mockFetch(developmentHandlers({
      "GET /api/children/c1/development-reviews": { body: { reviews: [followUpReview], context } satisfies ReviewsResponse },
      "GET /api/children/c1/ai-suggestions": {
        body: { suggestions: [{ id: "ais-9", kind: "understanding", output: { summary: "AI said Adam enjoys cars.", adaptations: "AI: start small.", next_steps: null } }] },
      },
    }));
    renderApp({ routes, url: "/children/c1/development", user: teacher, options: planOptions });
    const item = await screen.findByTestId("review-item");
    fireEvent.click(within(item).getByRole("button", { name: "Compare with the AI draft" }));
    const compare = await within(item).findByTestId("ai-draft-compare");
    expect(within(compare).getByText("AI said Adam enjoys cars.")).toBeTruthy();
    expect(within(compare).getByText("AI: start small.")).toBeTruthy();
    expect(within(compare).getByText("One friend at a time.")).toBeTruthy();
    expect(within(compare).getByText("AI suggested")).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: "Hide the AI draft" }));
    expect(within(item).queryByTestId("ai-draft-compare")).toBeNull();
  });
});

describe("Review: the AI never closes a goal; stage E per focus", () => {
  it("keeps the decision 'keep' when the suggestion says the focus is no longer needed", () => {
    const res: SuggestResponse = {
      ...suggestion,
      suggestion_id: "ais-2",
      suggestion: { ...suggestion.suggestion, focus_review: [{ focus_area_id: "f1", status: "no_longer_needed", note: "x" }] },
    };
    const d = suggestedDraft(res);
    expect(d.focus[0]!.status).toBe("no_longer_needed"); // shown as a suggestion
    expect(d.focus[0]!.decision).toBe("keep"); // only the teacher closes a goal
    expect(buildPayload({ ...d, understanding: { ...d.understanding, summary: "x" } }).focus_review[0]!.decision).toBe("keep");
  });

  it("lists the dated 'did anything change' results of each focus next to the evidence", async () => {
    const changes = { yes: [{ id: "o1", observed_at: "2026-10-02T09:00:00Z" }], partly: [{ id: "o2", observed_at: "2026-10-03T09:00:00Z" }], no: [] };
    const ctxWithChanges: DraftContext = { ...context, focus_areas: [{ ...focus("f1", "Joining group play"), changes }] };
    mockFetch(developmentHandlers({
      "GET /api/children/c1/development-reviews": { body: { reviews: [], context: ctxWithChanges } satisfies ReviewsResponse },
    }));
    renderApp({ routes, url: "/children/c1/review/new", user: teacher, options });
    fireEvent.click(await screen.findByRole("button", { name: "Write it myself" }));
    const stage = await screen.findByTestId("stage-e");
    expect(within(stage).getByText("Did anything change?")).toBeTruthy();
    expect(within(stage).getByText(/^Yes · /)).toBeTruthy();
    expect(within(stage).getByText(/^Partly · /)).toBeTruthy();
    expect(within(stage).queryByText(/^Not yet/)).toBeNull();
    expect(document.body.textContent).not.toMatch(SCORING);
  });
});

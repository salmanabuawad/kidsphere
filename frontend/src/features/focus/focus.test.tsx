import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockFetch, renderApp, teacher, type Handler } from "@/test/utils";
import enFocus from "@/i18n/messages/en/focus.json";
import heFocus from "@/i18n/messages/he/focus.json";
import arFocus from "@/i18n/messages/ar/focus.json";
import enDev from "@/i18n/messages/en/development.json";
import heDev from "@/i18n/messages/he/development.json";
import arDev from "@/i18n/messages/ar/development.json";
import { changedFields, type FocusArea, type FocusList, type GoalHistory } from "./api";
import { editPayload, toDraft } from "./GoalDialogs";
import { routes } from "./routes";
import { planChild, planOptions } from "./testData";

const SCORING = /\d+\s*%|\bscore\b|\bpoints\b/i;

const PLAN = {
  strength_used: "Imagination and building",
  need: "Joining other children's play",
  adaptation: "Start in a pair at the block corner",
  what_we_will_do: "Build the garage together",
  frequency: "Three mornings a week",
  who: "Rana and the assistant",
  success_looks_like: "Invites a friend to build without prompting",
};

const goal = (over: Partial<FocusArea>): FocusArea => ({
  id: "f1",
  child_id: "c1",
  category: "social",
  suggestion_key: "joining_group_play",
  title: "Joining group play",
  description: null,
  plan: null,
  follow_up_on: null,
  assessment_id: null,
  status: "active",
  close_reason: null,
  created_at: "2026-09-01T10:00:00Z",
  closed_at: null,
  ...over,
});

const active = goal({ plan: PLAN, follow_up_on: "2099-11-15" });
const paused = goal({ id: "f2", title: "Taking turns", suggestion_key: "taking_turns", status: "paused", closed_at: "2026-09-20T10:00:00Z" });
const done = goal({ id: "f3", title: "Saying goodbye", suggestion_key: null, status: "completed", close_reason: "Says goodbye calmly", closed_at: "2026-09-10T10:00:00Z" });

function list(goals: FocusArea[], extra: Partial<FocusList> = {}): FocusList {
  return { focus_areas: goals, max_active: 3, active_count: goals.filter((g) => g.status === "active").length, periods: [], family_hopes: null, need_candidates: [], ...extra };
}

function setup(data: FocusList, extra: Record<string, Handler> = {}, url = "/children/c1/plan", locale: "en" | "he" | "ar" = "en") {
  const fetchFn = mockFetch({
    "GET /api/children/c1": { body: { child: planChild } },
    "GET /api/children/c1/focus-areas": { body: data },
    ...extra,
  });
  const app = renderApp({ routes, url, user: { ...teacher, language: locale }, locale, options: planOptions });
  return { fetchFn, ...app };
}

describe("Plan tab", () => {
  it("shows each goal with the 6 plan columns, strength → need → adaptation and the closed goals", async () => {
    setup(list([active, paused, done]));
    expect((await screen.findByTestId("focus-count")).textContent).toBe("1 of 3 active");
    expect(screen.getByTestId("plan-sequence").textContent).toContain("Strength → Need → Adaptation");

    const card = screen.getByTestId("focus-card");
    const columns: [string, string][] = [
      ["title", "Joining group play"],
      ["what_we_will_do", PLAN.what_we_will_do],
      ["frequency", PLAN.frequency],
      ["who", PLAN.who],
      ["success_looks_like", PLAN.success_looks_like],
    ];
    for (const [k, v] of columns) expect(within(card).getByTestId(`plan-col-${k}`).textContent).toContain(v);
    const follow = within(card).getByTestId("plan-col-follow_up_on");
    expect(follow.textContent).toContain("Follow-up date");
    expect(within(follow).getByTestId("follow-up-chip").getAttribute("data-due")).toBe("false");
    expect(within(card).getByTestId("plan-step-strength_used").textContent).toContain(PLAN.strength_used);
    expect(within(card).getByTestId("plan-step-need").textContent).toContain(PLAN.need);
    expect(within(card).getByTestId("plan-step-adaptation").textContent).toContain(PLAN.adaptation);

    const closed = screen.getByTestId("closed-goals");
    expect(within(closed).getByText("Taking turns")).toBeTruthy();
    expect(within(closed).getByText("Saying goodbye")).toBeTruthy();
    expect(within(closed).getByText("Reason: Says goodbye calmly")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Export plan/ }).getAttribute("href")).toBe("/children/c1/reports?type=intervention_plan");
    expect(document.body.textContent).not.toMatch(SCORING);
  });

  it("guides towards 2–3 goals: below 2 on the page, and when adding the 3rd", async () => {
    setup(list([active]));
    expect(await screen.findByTestId("plan-guidance")).toBeTruthy();
    expect(screen.getByText("Choose 2–3 goals for this period")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add a goal" }));
    expect(screen.queryByTestId("third-goal-guidance")).toBeNull();
  });

  it("shows the third-goal guidance in the add dialog and no page banner with 2 goals", async () => {
    setup(list([active, goal({ id: "f4", title: "B", suggestion_key: null })]));
    expect((await screen.findByTestId("focus-count")).textContent).toBe("2 of 3 active");
    expect(screen.queryByTestId("plan-guidance")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add a goal" }));
    expect(await screen.findByTestId("third-goal-guidance")).toBeTruthy();
  });

  it("shows the third-goal hint next to promoting a Domain 13 need with 2 active goals", async () => {
    setup(
      list([active, goal({ id: "f4", title: "B", suggestion_key: null })], {
        need_candidates: [
          { assessment_id: "a1", index: 0, area: "social", seeing: "Watches play", how_often: null, focus_area_id: null, provenance: [{ label: "teacher_observed" }] },
        ],
      }),
    );
    const needs = await screen.findByTestId("need-candidates");
    expect(within(needs).getByTestId("third-goal-guidance").textContent).toBeTruthy();
  });

  it("disables adding at 3 active goals and explains why", async () => {
    setup(list([active, goal({ id: "f4", title: "B" }), goal({ id: "f5", title: "C" })]));
    expect((await screen.findByTestId("focus-count")).textContent).toBe("3 of 3 active");
    expect(screen.getByText(/Pause or complete one to add another/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add a goal" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("edits all plan columns, including how often, who and the follow-up date", async () => {
    let body: Record<string, unknown> | null = null;
    const legacy = goal({ plan: { need: "Joining play", review_on: "after the holidays" } });
    setup(list([legacy]), {
      "PUT /api/focus-areas/f1": (init) => {
        body = JSON.parse(String(init?.body));
        return { body: { focus_area: { ...legacy, plan: (body as { plan: FocusArea["plan"] }).plan, follow_up_on: "2026-12-01" } } };
      },
    });
    const card = await screen.findByTestId("focus-card");
    expect(within(card).getAllByText("Not written yet").length).toBeGreaterThanOrEqual(5);
    expect(within(card).getByText("Earlier note about the follow-up: after the holidays")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Edit goal and plan" }));
    fireEvent.change(await screen.findByLabelText(/How often/), { target: { value: "Daily" } });
    fireEvent.change(screen.getByLabelText(/^Who/), { target: { value: "The class teacher" } });
    fireEvent.change(screen.getByLabelText(/Follow-up date/), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText(/What we will do/), { target: { value: "Build together" } });
    fireEvent.click(screen.getByRole("button", { name: "Building" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      title: "Joining group play",
      description: null,
      plan: { review_on: "after the holidays", need: "Joining play", what_we_will_do: "Build together", frequency: "Daily", who: "The class teacher", strength_used: "Building" },
      follow_up_on: "2026-12-01",
    });
    await waitFor(() => expect(screen.getByTestId("plan-col-frequency").textContent).toContain("Daily"));
  });

  it("shows a friendly message when reactivating would exceed 3 active goals", async () => {
    setup(list([active, goal({ id: "f4", title: "B" }), goal({ id: "f5", title: "C" }), paused]), {
      "PUT /api/focus-areas/f2": { status: 409, body: { error: { code: "FOCUS_LIMIT", message: "limit" } } },
    });
    const closed = await screen.findByTestId("closed-goals");
    fireEvent.click(within(closed).getByRole("button", { name: "Make active again" }));
    expect(await screen.findByText("There are already 3 active goals. Pause or complete one first.")).toBeTruthy();
  });

  it("pauses a goal", async () => {
    let closeBody: unknown = null;
    setup(list([active]), {
      "POST /api/focus-areas/f1/close": (init) => {
        closeBody = JSON.parse(String(init?.body));
        return { body: { focus_area: { ...active, status: "paused", closed_at: "2026-10-05T10:00:00Z" } } };
      },
    });
    const card = await screen.findByTestId("focus-card");
    fireEvent.click(within(card).getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(closeBody).toEqual({ status: "paused" }));
    await waitFor(() => expect(within(screen.getByTestId("closed-goals")).getByText("Joining group play")).toBeTruthy());
    expect(screen.getByTestId("focus-count").textContent).toBe("0 of 3 active");
  });

  it("adds a goal from the suggestions", async () => {
    let body: unknown = null;
    setup(list([]), {
      "POST /api/children/c1/focus-areas": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { focus_area: goal({ id: "f9", title: "Taking turns", suggestion_key: "taking_turns" }) } };
      },
    });
    expect(await screen.findByText("No goals yet")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Add a goal" })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Taking turns" }));
    await waitFor(() => expect(body).toEqual({ suggestion_key: "taking_turns", title: "Taking turns" }));
  });

  it("keeps every closure in the goal history", async () => {
    const history: GoalHistory = {
      focus_area: done,
      versions: [
        { id: 1, seq: 1, data: { status: "active", title: "Saying goodbye" }, changed_by_name: "Rana", changed_role: "teacher", via: "manual", review_id: null, created_at: "2026-09-01T10:00:00Z" },
        { id: 2, seq: 2, data: { status: "completed", title: "Saying goodbye", close_reason: "Calm now" }, changed_by_name: "Rana", changed_role: "teacher", via: "review", review_id: "r1", created_at: "2026-09-05T10:00:00Z" },
        { id: 3, seq: 3, data: { status: "active", title: "Saying goodbye" }, changed_by_name: "Rana", changed_role: "teacher", via: "manual", review_id: null, created_at: "2026-09-07T10:00:00Z" },
        { id: 4, seq: 4, data: { status: "completed", title: "Saying goodbye", close_reason: "Says goodbye calmly" }, changed_by_name: "Rana", changed_role: "teacher", via: "manual", review_id: null, created_at: "2026-09-10T10:00:00Z" },
      ],
      status_changes: [
        { seq: 1, status: "active", previous: null, at: "2026-09-01T10:00:00Z", close_reason: null, changed_by_name: "Rana", via: "manual", review_id: null },
        { seq: 2, status: "completed", previous: "active", at: "2026-09-05T10:00:00Z", close_reason: "Calm now", changed_by_name: "Rana", via: "review", review_id: "r1" },
        { seq: 3, status: "active", previous: "completed", at: "2026-09-07T10:00:00Z", close_reason: null, changed_by_name: "Rana", via: "manual", review_id: null },
        { seq: 4, status: "completed", previous: "active", at: "2026-09-10T10:00:00Z", close_reason: "Says goodbye calmly", changed_by_name: "Rana", via: "manual", review_id: null },
      ],
    };
    setup(list([done]), { "GET /api/focus-areas/f3/versions": { body: history } });
    const closed = await screen.findByTestId("closed-goals");
    fireEvent.click(within(closed).getByRole("button", { name: "History" }));
    const panel = await screen.findByTestId("goal-history");
    const changes = within(panel).getAllByTestId("status-change");
    expect(changes).toHaveLength(4);
    expect(changes[1]!.textContent).toContain("Reason: Calm now");
    expect(changes[1]!.textContent).toContain("In a development review");
    expect(changes[3]!.textContent).toContain("Reason: Says goodbye calmly");
    const versions = within(panel).getAllByTestId("goal-version");
    expect(versions[0]!.textContent).toContain("Changed: Status, Reason for closing");
    expect(versions[3]!.textContent).toContain("First saved");
  });

  it("shows the family hopes (parent said, suggestions only) and turns a need into a goal", async () => {
    let promoted = false;
    setup(
      list([], {
        family_hopes: {
          develop: [{ area: "social", label: null, text: "To play with other children" }],
          categories: ["social"],
          hope_child_feels: ["safe"],
          hope_other: "Proud",
          note: null,
          provenance: [{ label: "parent_said", entered_by: "Rana", mode: "meeting" }],
        },
        need_candidates: [
          { assessment_id: "a1", index: 0, area: "social", seeing: "Watches play from the side", how_often: "Most mornings", focus_area_id: null, provenance: [{ label: "teacher_observed" }] },
        ],
      }),
      {
        "POST /api/teacher-assessments/a1/needs/0/focus": () => {
          promoted = true;
          return { status: 201, body: { focus_area: goal({ id: "f8", title: "Watches play" }) } };
        },
      },
    );
    const hopes = await screen.findByTestId("family-hopes");
    expect(within(hopes).getByText("To play with other children")).toBeTruthy();
    expect(within(hopes).getByText("Parent said")).toBeTruthy();
    expect(within(hopes).getByText(/Entered by/).textContent).toContain("Rana");
    expect(within(hopes).getByText("Other: Proud")).toBeTruthy();
    fireEvent.click(within(hopes).getByRole("button", { name: "Start a goal from this" }));
    expect(((await screen.findByLabelText("Area")) as HTMLSelectElement).value).toBe("social");
    expect(screen.getByRole("button", { name: "Joining group play" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Expressing frustration in words" })).toBeNull();

    const needs = screen.getByTestId("need-candidates");
    expect(within(needs).getByText("Teacher observed")).toBeTruthy();
    fireEvent.click(within(needs).getByRole("button", { name: "Make it a goal" }));
    await waitFor(() => expect(promoted).toBe(true));
  });

  it("redirects the old focus address to the Plan tab", async () => {
    const { router } = setup(list([active]), {}, "/children/c1/focus");
    await waitFor(() => expect(router.state.location.pathname).toBe("/children/c1/plan"));
    expect(await screen.findByTestId("focus-card")).toBeTruthy();
  });

  it("renders RTL in Hebrew and Arabic", async () => {
    setup(list([active]), {}, "/children/c1/plan", "he");
    expect((await screen.findByTestId("focus-count")).textContent).toBe("1 מתוך 3 פעילים");
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(screen.getByText("החוזקה שנשען עליה")).toBeTruthy();
    expect(screen.getByText("איך נדע שזה עוזר")).toBeTruthy();
  });

  it("renders in Arabic", async () => {
    setup(list([active]), {}, "/children/c1/plan", "ar");
    expect((await screen.findByTestId("focus-count")).textContent).toBe("1 من 3 نشطة");
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(screen.getByText("كيف سنعرف أن ذلك يساعد")).toBeTruthy();
  });
});

describe("plan helpers", () => {
  it("keeps the legacy review_on text and drops empty fields", () => {
    const f = goal({ plan: { review_on: "spring", need: "x" }, follow_up_on: "2026-11-01" });
    const d = { ...toDraft(f), need: " ", frequency: " Weekly ", follow_up_on: "" };
    expect(editPayload(f, d)).toEqual({ title: "Joining group play", description: null, plan: { review_on: "spring", frequency: "Weekly" }, follow_up_on: null });
  });

  it("lists the fields that changed between two versions", () => {
    expect(changedFields(null, { status: "active" })).toEqual([]);
    expect(changedFields({ status: "active", plan: { need: "a" } }, { status: "paused", plan: { need: "b", who: "c" } })).toEqual(["status", "plan.need", "plan.who"]);
  });
});

describe("Plan and Development wording", () => {
  it("never uses the source wording that terminology.md replaces", () => {
    const text = JSON.stringify([enFocus, heFocus, arFocus, enDev, heDev, arDev]);
    for (const banned of ["מדד הצלחה", "תוכנית התערבות", "הפניה", "הפנייה", "צוות רב-מקצועי", "הערכה מחדש", "Intervention Plan", "إحالة"]) {
      expect(text).not.toContain(banned);
    }
    expect(text).not.toMatch(SCORING);
  });
});

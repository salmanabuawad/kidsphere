import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChildStaffView } from "@/features/children";
import type { OptionLists } from "@/lib/options";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { routes } from "./routes";
import type { TimelineEntry } from "./TimelinePage";

const L = (en: string, ar: string, he: string) => ({ en, ar, he });

const options: OptionLists = {
  languages: [{ key: "ar", label: L("Arabic", "العربية", "ערבית") }],
  observation_contexts: [{ key: "free_play", icon: "🧸", label: L("Free play", "اللعب الحر", "משחק חופשי") }],
  support_levels: [
    { key: "independent", label: L("Independent", "مستقل", "עצמאי/ת"), short: L("Independent", "مستقل", "עצמאי/ת") },
    { key: "some_support", label: L("Needs some support", "يحتاج إلى بعض الدعم", "זקוק/ה לקצת תמיכה"), short: L("With support", "بمساعدة", "בתיווך") },
  ],
  priority_categories: [{ key: "social", icon: "🤝", label: L("Social", "المجال الاجتماعي", "חברתי") }],
  content_results: [
    { key: "worked_well", icon: "🌟", label: L("Worked well", "نجح جيداً", "עבד טוב") },
    { key: "partly", icon: "🌤️", label: L("Partly", "جزئياً", "חלקית") },
  ],
  content_types: [{ key: "real_world_activity", icon: "🤲", label: L("Real-world activity", "نشاط عملي", "פעילות מעשית") }],
  ai_domains: [{ key: "social", icon: "🤝", label: L("Social", "الجانب الاجتماعي", "חברתי") }],
};

const adam: ChildStaffView = {
  id: "c1",
  view: "staff",
  name: "Adam",
  preferred_name: null,
  birth_date: "2022-08-05",
  age: { years: 4, months: 2 },
  gender: "boy",
  class: { id: "c-a", name: "Class A", kindergarten: "Sunflower KG" },
  main_language: "ar",
  additional_languages: [],
  parent_name: null,
  parent_contact: null,
  has_photo: false,
  archived: false,
  updated_at: "2026-10-01T10:00:00Z",
  strengths: [],
  interests: [],
  what_helps: [],
  motivators: [],
  sensitivities: [],
  current_understanding: null,
  focus_areas: [],
  latest_observation: null,
  last_observation_at: null,
  wizard: { step: 1, completed_at: null },
  baseline: { exists: false, latest_created_at: null },
  draft_content_count: 0,
};

const entry = (over: Partial<TimelineEntry> & Pick<TimelineEntry, "type" | "at" | "id">): TimelineEntry => ({
  title: null,
  text: null,
  support_level: null,
  result: null,
  status: null,
  context: null,
  area: null,
  content_id: null,
  content_title: null,
  content_type: null,
  focus_area_id: null,
  focus_area_title: null,
  changes: null,
  via: null,
  by_name: "Rana",
  ...over,
});

const page1: TimelineEntry[] = [
  entry({ type: "observation", at: "2026-10-04T10:00:00Z", id: "o2", text: "Asked Omar to build together", support_level: "independent", context: "free_play", focus_area_title: "Joining group play" }),
  entry({ type: "content_feedback", at: "2026-10-03T11:00:00Z", id: "o1", result: "partly", content_title: "Build the Garage Together", text: "Stayed 8 minutes" }),
  entry({ type: "content_approved", at: "2026-10-03T09:00:00Z", id: "g1", title: "Build the Garage Together", content_title: "Build the Garage Together", content_type: "real_world_activity" }),
  entry({ type: "focus_closed", at: "2026-09-20T09:00:00Z", id: "f2", title: "Taking turns", status: "completed", area: "social" }),
];
const page2: TimelineEntry[] = [
  entry({ type: "focus_opened", at: "2026-09-01T10:05:00Z", id: "f1", title: "Joining group play", area: "social" }),
  entry({ type: "baseline", at: "2026-09-01T10:00:00Z", id: "b1" }),
];

const newTypes: TimelineEntry[] = [
  entry({ type: "assessment_closed", at: "2026-10-05T10:00:00Z", id: "a1", status: "initial" }),
  entry({ type: "summary_approved", at: "2026-10-04T12:00:00Z", id: "s1", status: "ai_draft", text: "Curious and kind" }),
  entry({ type: "plan_changed", at: "2026-10-03T12:00:00Z", id: "41", title: "Joining group play", status: "active", changes: ["plan", "follow_up_on"], via: "manual" }),
  entry({ type: "plan_changed", at: "2026-09-25T12:00:00Z", id: "40", title: "Taking turns", status: "active", changes: ["status"], via: "review" }),
  entry({ type: "questionnaire_submitted", at: "2026-09-02T12:00:00Z", id: "q1", status: "meeting", by_name: "Rana" }),
];

const DEV_TIMELINE = "/children/c1/development/timeline";

function queryOf(url: string) {
  return new URL(url, "http://x").searchParams;
}

describe("TimelinePage", () => {
  it("shows entries grouped by day with quotes and result chips, and loads older pages", async () => {
    const offsets: string[] = [];
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/timeline": (_init, url) => {
        const offset = queryOf(url).get("offset") ?? "0";
        offsets.push(offset);
        return offset === "0"
          ? { body: { entries: page1, limit: 30, offset: 0, has_more: true } }
          : { body: { entries: page2, limit: 30, offset: 30, has_more: false } };
      },
    });
    renderApp({ routes, url: DEV_TIMELINE, user: teacher, options });

    expect(await screen.findByText("Asked Omar to build together")).toBeTruthy();
    const quote = screen.getByText("Asked Omar to build together");
    expect(quote.tagName).toBe("BLOCKQUOTE");
    expect(quote.getAttribute("dir")).toBe("auto");

    const items = screen.getAllByTestId("timeline-entry");
    expect(items.map((i) => i.getAttribute("data-type"))).toEqual(["observation", "content_feedback", "content_approved", "focus_closed"]);
    expect(within(items[0]!).getByText("Independent")).toBeTruthy();
    expect(within(items[0]!).getByText("Free play")).toBeTruthy();
    expect(within(items[0]!).getByText("Focus: Joining group play")).toBeTruthy();
    expect(within(items[0]!).getByText("Teacher observed")).toBeTruthy();
    expect(within(items[1]!).getByText("After “Build the Garage Together”")).toBeTruthy();
    expect(within(items[1]!).getByText("Partly")).toBeTruthy();
    expect(within(items[2]!).getByRole("link", { name: "Build the Garage Together" }).getAttribute("href")).toBe("/content/g1");
    expect(within(items[3]!).getByText("Focus completed")).toBeTruthy();
    // 3 distinct days on the first page → 3 day lists.
    expect(screen.getByRole("region", { name: "Development timeline" }).querySelectorAll("ol").length).toBe(3);
    // It is a section of the Development tab.
    expect(screen.getByRole("link", { name: "Development", current: "page" }).getAttribute("href")).toBe("/children/c1/development");

    fireEvent.click(screen.getByRole("button", { name: "Load older" }));
    await waitFor(() => expect(screen.getAllByTestId("timeline-entry")).toHaveLength(6));
    expect(offsets).toEqual(["0", "4"]);
    expect(screen.queryByRole("button", { name: "Load older" })).toBeNull();
    expect(screen.getByText("Baseline created")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d+\s*%|score|points/i);
  });

  it("renders the new entry types with their links and provenance", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/timeline": { body: { entries: newTypes, limit: 30, offset: 0, has_more: false } },
    });
    renderApp({ routes, url: DEV_TIMELINE, user: teacher, options });
    await screen.findByText("Observation cycle closed");
    const items = screen.getAllByTestId("timeline-entry");
    expect(items.map((i) => i.getAttribute("data-type"))).toEqual(["assessment_closed", "summary_approved", "plan_changed", "plan_changed", "questionnaire_submitted"]);
    expect(within(items[0]!).getByText("First observation cycle")).toBeTruthy();
    expect(within(items[0]!).getByRole("link").getAttribute("href")).toBe("/children/c1/teacher-observation?cycle=a1");
    expect(within(items[1]!).getByText("Functional summary approved")).toBeTruthy();
    expect(within(items[1]!).getByText("AI-assisted draft, approved by the team")).toBeTruthy();
    expect(within(items[1]!).getByText("Teacher approved")).toBeTruthy();
    expect(within(items[2]!).getByText("Plan updated")).toBeTruthy();
    expect(within(items[2]!).getByText("Changed: plan, follow-up date")).toBeTruthy();
    expect(within(items[2]!).getByRole("link", { name: "Open the plan" }).getAttribute("href")).toBe("/children/c1/plan");
    expect(within(items[3]!).getByText("Focus active again")).toBeTruthy();
    expect(within(items[3]!).getByText("Decided in a development review")).toBeTruthy();
    expect(within(items[4]!).getByText("Family questionnaire received")).toBeTruthy();
    expect(within(items[4]!).getByText("Filled in together with the family")).toBeTruthy();
    expect(within(items[4]!).getByText("Parent said")).toBeTruthy();
    expect(within(items[4]!).getByRole("link", { name: "Open the parent view" }).getAttribute("href")).toBe("/children/c1/parent-view");
  });

  it("keeps filters in the URL and sends them to the API (each change reloads from the start)", async () => {
    const urls: string[] = [];
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/focus-areas": { body: { focus_areas: [{ id: "f1", title: "Joining group play", status: "active" }] } },
      "GET /api/children/c1/timeline": (_init, url) => {
        urls.push(url);
        return { body: { entries: page1, limit: 30, offset: 0, has_more: false } };
      },
    });
    const { router } = renderApp({ routes, url: `${DEV_TIMELINE}?domain=social&type=observation`, user: teacher, options });
    await screen.findByText("Asked Omar to build together");
    let q = queryOf(urls[0]!);
    expect(q.get("domain")).toBe("social");
    expect(q.getAll("type")).toEqual(["observation"]);
    expect(q.get("offset")).toBe("0");
    // The active filter shows as a removable chip; the Observations chip is selected.
    expect(screen.getByRole("button", { name: "Remove filter: Social" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Observations", pressed: true })).toBeTruthy();

    // Open the fields and pick a result and a focus.
    fireEvent.click(screen.getByRole("button", { name: "Filter", expanded: false }));
    fireEvent.change(screen.getByLabelText("How it went"), { target: { value: "worked_well" } });
    await waitFor(() => expect(router.state.location.search).toContain("result=worked_well"));
    await screen.findByRole("option", { name: "Joining group play" });
    fireEvent.change(screen.getByLabelText("Focus"), { target: { value: "f1" } });
    await waitFor(() => expect(queryOf(urls[urls.length - 1]!).get("focus_area_id")).toBe("f1"));
    q = queryOf(urls[urls.length - 1]!);
    expect([q.get("domain"), q.get("result"), q.getAll("type")]).toEqual(["social", "worked_well", ["observation"]]);
    expect(router.state.location.search).toContain("focus_area_id=f1");

    // A group chip adds all of its entry types; another tap removes them again.
    fireEvent.click(screen.getByRole("button", { name: "Plans and goals" }));
    await waitFor(() => expect(router.state.location.search).toContain("type=plan_changed"));
    expect(new URLSearchParams(router.state.location.search).getAll("type")).toEqual(["observation", "focus_opened", "plan_changed", "focus_closed"]);
    fireEvent.click(screen.getByRole("button", { name: "Plans and goals", pressed: true }));
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).getAll("type")).toEqual(["observation"]));

    // Clear filters removes everything.
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    q = queryOf(urls[urls.length - 1]!);
    expect([...q.keys()].sort()).toEqual(["limit", "offset"]);
  });

  it("shows a filtered empty state with Clear filters", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/timeline": { body: { entries: [], limit: 30, offset: 0, has_more: false } },
    });
    renderApp({ routes, url: `${DEV_TIMELINE}?date_from=2026-09-01&date_to=2026-09-30`, user: teacher, options });
    expect(await screen.findByText("Nothing matches these filters")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove filter: From/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove filter: Until/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Clear filters" }).length).toBeGreaterThan(0);
  });

  it("redirects the old timeline tab to Development › Timeline, keeping filters", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/timeline": { body: { entries: [], limit: 30, offset: 0, has_more: false } },
    });
    const { router } = renderApp({ routes, url: "/children/c1/timeline?result=partly", user: teacher, options });
    await waitFor(() => expect(router.state.location.pathname).toBe(DEV_TIMELINE));
    expect(router.state.location.search).toBe("?result=partly");
  });

  it("shows a friendly empty state with Add observation", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/timeline": { body: { entries: [], limit: 30, offset: 0, has_more: false } },
    });
    renderApp({ routes, url: DEV_TIMELINE, user: teacher, options });
    expect(await screen.findByText("Nothing on the timeline yet")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Add observation/ })[0]!.getAttribute("href")).toBe("/children/c1/observe");
  });

  for (const [locale, title, independent, partly, tab] of [
    ["ar", "مسار التطور", "مستقل", "جزئياً", "التطور"],
    ["he", "ציר ההתפתחות", "עצמאי/ת", "חלקית", "התפתחות"],
  ] as const) {
    it(`renders RTL in ${locale}`, async () => {
      mockFetch({
        "GET /api/children/c1": { body: { child: adam } },
        "GET /api/children/c1/timeline": { body: { entries: page1, limit: 30, offset: 0, has_more: false } },
      });
      renderApp({ routes, url: DEV_TIMELINE, user: { ...teacher, language: locale }, locale, options });
      expect(await screen.findByText(title)).toBeTruthy();
      await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
      expect(await screen.findByText(independent)).toBeTruthy();
      expect(screen.getByText(partly)).toBeTruthy();
      expect(screen.getByRole("link", { name: tab, current: "page" })).toBeTruthy();
    });
  }
});

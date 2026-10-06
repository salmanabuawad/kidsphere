import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChildStaffView } from "@/features/children";
import type { AppLocale } from "@/i18n/config";
import type { OptionLists } from "@/lib/options";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { isEdited, normalizeVersions, type ObservationRow } from "./api";
import { routes } from "./routes";

const L = (en: string, ar: string, he: string) => ({ en, ar, he });

const options: OptionLists = {
  observation_contexts: [
    { key: "free_play", icon: "🧸", label: L("Free play", "اللعب الحر", "משחק חופשי") },
    { key: "yard", icon: "🌳", label: L("Yard", "الساحة", "חצר") },
  ],
  support_levels: [
    { key: "independent", label: L("Independent", "مستقل", "עצמאי/ת"), short: L("Independent", "مستقل", "עצמאי/ת") },
    { key: "some_support", label: L("Needs some support", "يحتاج إلى بعض الدعم", "זקוק/ה לקצת תמיכה"), short: L("With support", "بمساعدة", "בתיווך") },
  ],
  ai_domains: [
    { key: "social", icon: "🤝", label: L("Social", "الجانب الاجتماعي", "חברתי") },
    { key: "language", icon: "🗣️", label: L("Language", "اللغة", "שפה") },
  ],
  content_results: [{ key: "worked_well", icon: "🌟", label: L("Worked well", "نجح جيداً", "עבד טוב") }],
  what_helps: [{ key: "visual_support", label: L("Visual support", "دعم بصري", "תמיכה חזותית") }],
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

const row = (over: Partial<ObservationRow> & Pick<ObservationRow, "id">): ObservationRow => ({
  source: "quick",
  observed_at: "2026-10-04T09:00:00Z",
  focus_area_id: null,
  focus_area_title: null,
  content_id: null,
  content_title: null,
  result: null,
  area: null,
  context: null,
  observation: "Played",
  support_level: null,
  what_helped: null,
  note: null,
  details: null,
  domains: [],
  created_by: { id: "u-teacher", name: "Rana Haddad" },
  created_at: "2026-10-04T09:00:00Z",
  updated_at: "2026-10-04T09:00:00Z",
  ...over,
});

const edited = row({
  id: "o1",
  observation: "Asked Omar to build the tower together",
  support_level: "some_support",
  context: "free_play",
  domains: ["social"],
  focus_area_id: "f1",
  focus_area_title: "Joining group play",
  details: { what_i_see: "Watched for a minute, then asked", did_it_change: "partly" },
  what_helped: [{ key: "visual_support" }],
  updated_at: "2026-10-05T08:00:00Z",
});
const feedback = row({ id: "o2", source: "content_feedback", observation: null, result: "worked_well", content_title: "Build the Garage Together" });
const plain = row({ id: "o3", observation: "Told a story about a lion", domains: ["language"], context: "yard", observed_at: "2026-10-01T09:00:00Z" });

const LIST = "/api/children/c1/observations";
const page = (observations: ObservationRow[], has_more = false) => ({ body: { observations, limit: 30, offset: 0, has_more } });

describe("Observations tab", () => {
  it("lists quick and structured observations with chips, the edited marker and visible provenance", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: adam } }, [`GET ${LIST}`]: page([edited, feedback, plain]) });
    renderApp({ routes, url: "/children/c1/observations", user: teacher, options });

    const rows = await screen.findAllByTestId("observation-row");
    expect(rows.map((r) => r.getAttribute("data-source"))).toEqual(["quick", "content_feedback", "quick"]);
    const first = rows[0]!;
    expect(within(first).getByText("Asked Omar to build the tower together").getAttribute("dir")).toBe("auto");
    expect(within(first).getByText("With support")).toBeTruthy();
    expect(within(first).getByText("Free play")).toBeTruthy();
    expect(within(first).getByText("Social")).toBeTruthy();
    expect(within(first).getByText("Focus: Joining group play")).toBeTruthy();
    expect(within(first).getByText("Observe, understand, act")).toBeTruthy();
    expect(within(first).getByTestId("edited-marker").textContent).toBe("Edited");
    expect(within(first).getByText("Teacher observed")).toBeTruthy();
    expect(within(first).getByRole("link", { name: "Details" }).getAttribute("href")).toBe("/children/c1/observations/o1");

    expect(within(rows[1]!).getByText("After “Build the Garage Together”")).toBeTruthy();
    expect(within(rows[1]!).getByText("Worked well")).toBeTruthy();
    expect(within(rows[1]!).getByText("Feedback without a note")).toBeTruthy();
    expect(within(rows[1]!).queryByTestId("edited-marker")).toBeNull();
    expect(within(rows[2]!).queryByTestId("edited-marker")).toBeNull();

    // The tab is active and nothing is counted, charted or scored.
    expect(screen.getByRole("link", { name: "Observations", current: "page" }).getAttribute("href")).toBe("/children/c1/observations");
    expect(document.body.textContent).not.toMatch(/\d+\s*%|\bscore\b|\bpoints\b/i);
    expect(document.querySelector("svg[role='img'], canvas")).toBeNull();
  });

  it("keeps every filter in the URL and sends it to the API", async () => {
    const urls: string[] = [];
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/focus-areas": { body: { focus_areas: [{ id: "f1", title: "Joining group play", status: "active" }] } },
      [`GET ${LIST}`]: (_init, url) => {
        urls.push(url);
        return page([plain]);
      },
    });
    const { router } = renderApp({ routes, url: "/children/c1/observations?domain=language&source=quick", user: teacher, options });
    await screen.findAllByTestId("observation-row");
    const last = () => new URL(urls[urls.length - 1]!, "http://x").searchParams;
    expect([last().get("domain"), last().get("source"), last().get("offset")]).toEqual(["language", "quick", "0"]);
    expect(screen.getByRole("button", { name: "Remove filter: Language" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove filter: Quick observation" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-01" } });
    await waitFor(() => expect(router.state.location.search).toContain("date_from=2026-09-01"));
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("Situation"), { target: { value: "yard" } });
    await screen.findByRole("option", { name: "Joining group play" });
    fireEvent.change(screen.getByLabelText("Focus"), { target: { value: "f1" } });
    await waitFor(() => expect(last().get("focus_area_id")).toBe("f1"));
    expect(Object.fromEntries(last())).toMatchObject({
      date_from: "2026-09-01",
      date_to: "2026-09-30",
      focus_area_id: "f1",
      domain: "language",
      context: "yard",
      source: "quick",
    });
    const kept = new URLSearchParams(router.state.location.search);
    expect(Object.fromEntries(kept)).toEqual({
      domain: "language",
      source: "quick",
      date_from: "2026-09-01",
      date_to: "2026-09-30",
      context: "yard",
      focus_area_id: "f1",
    });

    // Removing one chip keeps the others.
    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Language" }));
    await waitFor(() => expect(router.state.location.search).not.toContain("domain="));
    expect(router.state.location.search).toContain("context=yard");
    // Filters survive opening an observation and coming back.
    fireEvent.click(screen.getAllByRole("link", { name: "Details" })[0]!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/children/c1/observations/o3"));
    fireEvent.click(screen.getByRole("link", { name: "All observations" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/children/c1/observations"));
    expect(router.state.location.search).toContain("context=yard");
  });

  it("shows a filtered empty state and pages with Load older", async () => {
    const offsets: string[] = [];
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      [`GET ${LIST}`]: (_init, url) => {
        const q = new URL(url, "http://x").searchParams;
        offsets.push(q.get("offset") ?? "");
        if (q.get("context") === "yard") return page([]);
        return q.get("offset") === "0" ? page([edited, feedback], true) : page([plain]);
      },
    });
    const { router } = renderApp({ routes, url: "/children/c1/observations", user: teacher, options });
    await screen.findAllByTestId("observation-row");
    fireEvent.click(screen.getByRole("button", { name: "Load older" }));
    await waitFor(() => expect(screen.getAllByTestId("observation-row")).toHaveLength(3));
    expect(offsets).toEqual(["0", "2"]);

    await router.navigate("/children/c1/observations?context=yard");
    expect(await screen.findByText("No observations match these filters")).toBeTruthy();
  });

  for (const [locale, title, support] of [
    ["ar", "الملاحظات", "بمساعدة"],
    ["he", "תצפיות", "בתיווך"],
  ] as [AppLocale, string, string][]) {
    it(`renders RTL in ${locale}`, async () => {
      mockFetch({ "GET /api/children/c1": { body: { child: adam } }, [`GET ${LIST}`]: page([edited]) });
      renderApp({ routes, url: "/children/c1/observations", user: { ...teacher, language: locale }, locale, options });
      expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
      await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
      expect(await screen.findByText(support)).toBeTruthy();
    });
  }
});

describe("Observation detail", () => {
  const versions = {
    versions: [
      { id: 7, seq: 1, data: { observation: "Asked Omar to build", support_level: "significant_support", source: "quick" }, changed_by_name: "Rana Haddad", via: "backfill", created_at: "2026-10-04T09:00:00Z" },
      { id: 9, seq: 2, data: { observation: "Asked Omar to build the tower together", support_level: "some_support", source: "quick" }, changed_by_name: "Rana Haddad", via: "edited", created_at: "2026-10-05T08:00:00Z" },
    ],
  };

  it("shows the details and every version, the first one kept as it was", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      [`GET ${LIST}`]: page([edited]),
      "GET /api/observations/o1/versions": { body: versions },
    });
    renderApp({ routes, url: "/children/c1/observations", user: teacher, options });
    fireEvent.click((await screen.findAllByRole("link", { name: "Details" }))[0]!);

    const detail = await screen.findByTestId("observation-detail");
    expect(within(detail).getByText("Asked Omar to build the tower together")).toBeTruthy();
    expect(within(detail).getByText("Watched for a minute, then asked")).toBeTruthy();
    expect(within(detail).getByText("Partly")).toBeTruthy();
    expect(within(detail).getByText("Visual support")).toBeTruthy();
    expect(within(detail).getByTestId("edited-marker")).toBeTruthy();

    const history = await screen.findByTestId("observation-versions");
    const items = within(history).getAllByTestId("observation-version");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Current version")).toBeTruthy();
    expect(within(items[1]!).getByText("First version")).toBeTruthy();
    expect(within(items[1]!).getByText("Asked Omar to build")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Observations", current: "page" })).toBeTruthy();
  });

  it("works from a direct link using the latest version", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: adam } }, "GET /api/observations/o1/versions": { body: versions } });
    renderApp({ routes, url: "/children/c1/observations/o1", user: teacher, options });
    const detail = await screen.findByTestId("observation-detail");
    expect(within(detail).getByText("Asked Omar to build the tower together")).toBeTruthy();
    expect(within(detail).getByText("With support")).toBeTruthy();
  });

  it("says so when the observation cannot be found", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: adam } } });
    renderApp({ routes, url: "/children/c1/observations/zzz", user: teacher, options });
    expect(await screen.findByText("This observation could not be found.")).toBeTruthy();
  });
});

describe("observation helpers", () => {
  it("isEdited uses the backend flag, the version count or the timestamps", () => {
    expect(isEdited(row({ id: "a", edited: true }))).toBe(true);
    expect(isEdited(row({ id: "a", version_count: 1, updated_at: "2026-10-09T00:00:00Z" }))).toBe(false);
    expect(isEdited(row({ id: "a", updated_at: "2026-10-04T09:00:01Z" }))).toBe(false);
    expect(isEdited(row({ id: "a", updated_at: "2026-10-04T10:00:00Z" }))).toBe(true);
  });

  it("normalizeVersions accepts a list or {versions} and sorts oldest first", () => {
    expect(normalizeVersions([{ id: 2, seq: 2, data: {} }, { id: 1, seq: 1, data: null }]).map((v) => v.seq)).toEqual([1, 2]);
    expect(normalizeVersions({ versions: [{ id: 1, seq: 1, data: { observation: "x" } }] })[0]!.data).toEqual({ observation: "x" });
    expect(normalizeVersions(null)).toEqual([]);
  });
});

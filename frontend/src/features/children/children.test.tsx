import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppLocale } from "@/i18n/config";
import type { OptionLists } from "@/lib/options";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { displayName, notObservedRecently, photoUrl } from "./api";
import { routes } from "./routes";
import type { ChildCard, ChildListResponse, ChildStaffView } from "./types";

const L = (en: string, ar: string, he: string) => ({ en, ar, he });

const options: OptionLists = {
  languages: [
    { key: "ar", label: L("Arabic", "العربية", "ערבית") },
    { key: "he", label: L("Hebrew", "العبرية", "עברית") },
    { key: "en", label: L("English", "الإنجليزية", "אנגלית") },
  ],
  genders: [
    { key: "girl", label: L("Girl", "بنت", "בת") },
    { key: "boy", label: L("Boy", "ولد", "בן") },
  ],
  strengths: [
    { key: "imagination", icon: "🌈", label: L("Imagination", "الخيال", "דמיון") },
    { key: "building", icon: "🧱", label: L("Building", "البناء", "בנייה") },
  ],
  interests: [{ key: "cars_transportation", icon: "🚗", label: L("Cars & transportation", "السيارات ووسائل النقل", "מכוניות וכלי תחבורה") }],
  what_helps: [{ key: "visual_support", icon: "🖼️", label: L("Visual support", "دعم بصري", "תמיכה חזותית") }],
  calming_helps: [{ key: "hug", icon: "🤗", label: L("A hug", "حضن", "חיבוק") }],
  priority_categories: [{ key: "social", label: L("Social", "اجتماعي", "חברתי") }],
  support_levels: [{ key: "some_support", label: L("Needs some support", "يحتاج إلى بعض الدعم", "זקוק/ה לקצת תמיכה") }],
};

const classA = { id: "c-a", name: "Class A", kindergarten: "Sunflower KG" };
const classB = { id: "c-b", name: "Class B", kindergarten: "Sunflower KG" };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const adam: ChildCard = {
  id: "c1",
  name: "Adam",
  preferred_name: null,
  birth_date: "2022-08-05",
  age: { years: 4, months: 2 },
  class: classA,
  main_language: "ar",
  has_photo: false,
  updated_at: "2026-10-01T10:00:00Z",
  wizard_completed: true,
  active_focus_count: 1,
  last_observation_at: daysAgo(2),
  draft_content_count: 2,
};
const maya: ChildCard = {
  ...adam,
  id: "c2",
  name: "Maya",
  birth_date: "2021-11-20",
  class: classB,
  draft_content_count: 0,
  last_observation_at: daysAgo(20),
  wizard_completed: false,
};
const listing: ChildListResponse = { children: [adam, maya], classes: [classA, classB] };

const detail: ChildStaffView = {
  id: "c1",
  view: "staff",
  name: "Adam",
  preferred_name: null,
  birth_date: "2022-08-05",
  age: { years: 4, months: 2 },
  gender: "boy",
  class: classA,
  main_language: "ar",
  additional_languages: ["he"],
  parent_name: "Huda",
  parent_contact: null,
  has_photo: false,
  archived: false,
  updated_at: "2026-10-01T10:00:00Z",
  strengths: [
    { key: "imagination", sources: ["parent", "teacher"] },
    { custom: "Tells long stories", sources: ["teacher"] },
  ],
  interests: [{ key: "cars_transportation", sources: ["parent"] }],
  what_helps: [
    { key: "visual_support", sources: ["teacher"], list: "what_helps" },
    { key: "hug", sources: ["parent"], list: "calming_helps" },
  ],
  motivators: [],
  sensitivities: [],
  current_understanding: null,
  focus_areas: [
    {
      id: "f1",
      title: "Joining group play",
      category: "social",
      suggestion_key: "joining_group_play",
      description: null,
      plan: { strength_used: "Building", need: "Starting shared play", what_we_will_do: "Build the garage together" },
      created_at: null,
    },
    { id: "f2", title: "Taking turns", category: "social", suggestion_key: null, description: null, plan: null, created_at: null },
  ],
  latest_observation: {
    id: "o1",
    observed_at: "2026-10-03T09:00:00Z",
    observation: "Asked Sami to build together",
    support_level: "some_support",
    source: "quick",
    focus_area_id: "f1",
  },
  last_observation_at: "2026-10-03T09:00:00Z",
  wizard: { step: 8, completed_at: "2026-09-01T10:00:00Z" },
  baseline: { exists: true, latest_created_at: "2026-09-01T10:00:00Z" },
  draft_content_count: 0,
};

describe("helpers", () => {
  it("notObservedRecently uses a 14 day window and treats 'never' as not recent", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(notObservedRecently(null, now)).toBe(true);
    expect(notObservedRecently("2026-10-01T12:00:00Z", now)).toBe(false);
    expect(notObservedRecently("2026-09-21T12:00:00Z", now)).toBe(true);
  });

  it("displayName prefers the preferred name; photoUrl versions the url", () => {
    expect(displayName({ name: "Adam K", preferred_name: "Adoush" })).toBe("Adoush");
    expect(displayName({ name: "Adam K", preferred_name: " " })).toBe("Adam K");
    expect(photoUrl("c1", "v 1")).toBe("/api/children/c1/photo?v=v%201");
  });
});

describe("ChildListPage", () => {
  it("shows cards, attention strips, the add-child link and filters by search and class", async () => {
    mockFetch({ "GET /api/children": { body: listing } });
    renderApp({ routes, url: "/children", user: teacher, options });

    const cards = await screen.findByTestId("child-cards");
    expect(within(cards).getByText("Adam")).toBeTruthy();
    expect(within(cards).getByText("Maya")).toBeTruthy();
    expect(within(cards).getAllByText(/\d+ years?/).length).toBe(2);

    const add = screen.getAllByRole("link", { name: /add child/i })[0]!;
    expect(add.getAttribute("href")).toBe("/children/new");

    const drafts = screen.getByRole("region", { name: "Drafts waiting" });
    expect(within(drafts).getByText("Adam")).toBeTruthy();
    expect(within(drafts).queryByText("Maya")).toBeNull();
    const quiet = screen.getByRole("region", { name: "Not observed recently" });
    expect(within(quiet).getByText("Maya")).toBeTruthy();
    expect(within(quiet).getByRole("link").getAttribute("href")).toBe("/children/c2/observe");

    fireEvent.change(screen.getByLabelText("Search children"), { target: { value: "may" } });
    expect(within(screen.getByTestId("child-cards")).queryByText("Adam")).toBeNull();
    expect(within(screen.getByTestId("child-cards")).getByText("Maya")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search children"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "c-a" } });
    expect(within(screen.getByTestId("child-cards")).getByText("Adam")).toBeTruthy();
    expect(within(screen.getByTestId("child-cards")).queryByText("Maya")).toBeNull();
  });

  it("shows a friendly empty state with the add button", async () => {
    mockFetch({ "GET /api/children": { body: { children: [], classes: [classA] } } });
    renderApp({ routes, url: "/children", user: teacher, options });
    expect(await screen.findByText("No children yet")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /add child/i }).length).toBeGreaterThan(0);
  });
});

describe("ChildProfilePage", () => {
  const expected: Record<AppLocale, { dir: string; strength: string; interest: string; helps: string; focusTitle: string; tab: string }> = {
    en: { dir: "ltr", strength: "Imagination", interest: "Cars & transportation", helps: "A hug", focusTitle: "Current focus", tab: "Timeline" },
    ar: { dir: "rtl", strength: "الخيال", interest: "السيارات ووسائل النقل", helps: "حضن", focusTitle: "التركيز الحالي", tab: "الخط الزمني" },
    he: { dir: "rtl", strength: "דמיון", interest: "מכוניות וכלי תחבורה", helps: "חיבוק", focusTitle: "מיקוד נוכחי", tab: "ציר זמן" },
  };

  for (const locale of ["en", "ar", "he"] as AppLocale[]) {
    it(`renders strengths, interests, what helps and numbered focus in ${locale}`, async () => {
      const e = expected[locale];
      mockFetch({ "GET /api/children/c1": { body: { child: detail } } });
      renderApp({ routes, url: "/children/c1", user: { ...teacher, language: locale }, locale, options });

      const strengths = await screen.findByTestId("section-strengths");
      await waitFor(() => expect(document.documentElement.dir).toBe(e.dir));
      expect(within(strengths).getByText(e.strength)).toBeTruthy();
      const custom = within(strengths).getByText("Tells long stories");
      expect(custom.getAttribute("dir")).toBe("auto");
      expect(within(screen.getByTestId("section-interests")).getByText(e.interest)).toBeTruthy();
      expect(within(screen.getByTestId("section-what_helps")).getByText(e.helps)).toBeTruthy();

      expect(screen.getByText(e.focusTitle)).toBeTruthy();
      const focus = within(screen.getByTestId("focus-list")).getAllByRole("listitem");
      expect(focus).toHaveLength(2);
      expect(focus[0]!.textContent).toContain("1");
      expect(focus[0]!.textContent).toContain("Joining group play");
      expect(focus[1]!.textContent).toContain("2");
      expect(screen.getByText("Asked Sami to build together")).toBeTruthy();

      expect(screen.getByRole("link", { name: e.tab }).getAttribute("href")).toBe("/children/c1/timeline");
      // No numbers dressed up as scores anywhere on the page.
      expect(document.body.textContent).not.toMatch(/\d+\s*%/);
    });
  }

  it("links the four main actions and shows the plan on demand", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: detail } } });
    renderApp({ routes, url: "/children/c1", user: teacher, options });
    await screen.findByTestId("section-strengths");
    const href = (name: string) => screen.getAllByRole("link", { name })[0]!.getAttribute("href");
    expect(href("Add observation")).toBe("/children/c1/observe");
    expect(href("View development")).toBe("/children/c1/development");
    expect(href("Edit profile")).toBe("/children/c1/edit/1");
    expect(screen.getAllByRole("link", { name: "Create content" })[0]!.getAttribute("href")).toBe("/children/c1/content/new");

    fireEvent.click(screen.getByRole("button", { name: "Show plan" }));
    expect(screen.getByText("Build the garage together")).toBeTruthy();
    expect(screen.getByText(/Strength we use/)).toBeTruthy();
  });

  it("invites the teacher to continue an unfinished profile", async () => {
    const unfinished = { ...detail, wizard: { step: 3, completed_at: null }, baseline: { exists: false, latest_created_at: null } };
    mockFetch({ "GET /api/children/c1": { body: { child: unfinished } } });
    renderApp({ routes, url: "/children/c1", user: teacher, options });
    expect(await screen.findByText("Continue the profile")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Continue$/ }).getAttribute("href")).toBe("/children/c1/edit/3");
  });

  it("shows the baseline hint when the wizard is done but no baseline exists", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: { ...detail, baseline: { exists: false, latest_created_at: null } } } } });
    renderApp({ routes, url: "/children/c1", user: teacher, options });
    expect(await screen.findByText("Create the baseline")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Create baseline/ }).getAttribute("href")).toBe("/children/c1/edit/8");
  });

  it("shows a not-found message for an unknown child", async () => {
    mockFetch({});
    renderApp({ routes, url: "/children/zzz", user: teacher, options });
    expect(await screen.findByRole("link", { name: "All children" })).toBeTruthy();
  });
});

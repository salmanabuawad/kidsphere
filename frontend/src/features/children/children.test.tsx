import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppLocale } from "@/i18n/config";
import type { OptionLists } from "@/lib/options";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";
import { displayName, notObservedRecently, photoUrl } from "./api";
import { ChildLayout } from "./ChildLayout";
import { nextReviewOn, overviewData, textOf } from "./overview";
import { deriveFromSources, itemProvenance, parentSaid } from "./provenance";
import { routes } from "./routes";
import type { ChildCard, ChildListResponse, ChildStaffView, ProfileResponse } from "./types";

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
  strengths: [
    { key: "imagination", sources: ["teacher"] },
    { key: "building", sources: ["parent"] },
    { custom: "Tall towers", sources: ["teacher"] },
  ],
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
  strengths: [],
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

    // The whole card is one link, and it leads with the first two strengths, then "+N".
    const adamCard = screen.getByTestId("child-card-c1");
    expect(adamCard.getAttribute("href")).toBe("/children/c1");
    expect(within(adamCard).getByText("Imagination")).toBeTruthy();
    expect(within(adamCard).getByText("Building")).toBeTruthy();
    expect(within(adamCard).queryByText("Tall towers")).toBeNull();
    expect(within(adamCard).getByText("+1")).toBeTruthy();
    expect(within(adamCard).queryByRole("link")).toBeNull();

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

const overviewOptions: OptionLists = {
  ...options,
  describe_words: [{ key: "curious", label: L("Curious", "فضولي", "סקרן/ית") }],
  contact_preferences: [
    { key: "phone", label: L("Phone call", "مكالمة هاتفية", "שיחת טלפון") },
    { key: "message", label: L("Message", "رسالة", "הודעה") },
    { key: "other", label: L("Other", "طريقة أخرى", "אחר") },
  ],
  observation_domains: [{ key: "social", label: L("Social", "الجانب الاجتماعي", "חברתי") }],
};

/** GET /api/children/c1/profile for staff (WP2-PQ shape; values are open JSON). */
const profile: ProfileResponse = {
  child_id: "c1",
  perspective: "teacher",
  parent_perspective: {
    sections: {
      heart: { message: "He is shy at first, give him a minute and he will shine." },
      who: { describe_words: [{ key: "curious" }], appreciate: "His kindness to his little sister" },
      expectations: { most_important: "He needs a quiet start to the morning" },
      independence: { routines_to_keep: "Washes hands before eating" },
      emotions: { overwhelming_situations: { value: "yes", text: "Loud birthday parties" } },
      health: { food: { text: "SECRET-FOOD-TEXT", flags: ["allergy"] }, medical: { value: "yes", text: "SECRET-MEDICAL-TEXT" } },
      partnership: { contact_channels: { selected: ["phone", "other"], other: "Grandma at pickup" }, communication_matters: "Short messages" },
    },
    entered: {
      heart: [{ by_name: "Huda", role: "parent", reported_by: "parent", at: "2026-09-01T10:00:00Z", mode: "self" }],
      expectations: [{ by_name: "Rana Haddad", role: "teacher", reported_by: "parent", at: "2026-09-02T10:00:00Z", mode: "meeting" }],
    },
    questionnaire: { status: "submitted", submitted_at: "2026-09-02T10:00:00Z", entry_mode: "meeting" },
    section_status: {},
  },
  teacher_perspective: {
    sections: {
      bridge: { remember: [{ text: "Likes to sit near the window" }], question_for_parent: { text: "Does he nap at home?", status: "open" } },
    },
    section_status: { bridge: { status: "in_progress" } },
  },
  strengths: [
    { key: "imagination", sources: ["parent", "teacher"], provenance: ["parent_said", "teacher_observed"] },
    { custom: "Tells long stories", sources: ["teacher"], main: true, provenance: ["teacher_observed"] },
  ],
  interests: [{ key: "cars_transportation", sources: ["parent"], provenance: [{ label: "parent_said", entered_by: "Rana Haddad", mode: "meeting" }] }],
  what_helps: [{ key: "hug", sources: ["review"], list: "calming_helps", provenance: ["teacher_approved"] }],
};

const assessments = { current: { id: "a1", domains: { social: { status: "review_later" }, play: { status: "in_progress" } } }, earlier: [] };

const TAB_LABELS: Record<AppLocale, string[]> = {
  en: ["Overview", "Parent view", "Teacher observation", "Plan", "Activities", "Observations", "Development", "Reports"],
  ar: ["نظرة عامة", "رؤية الأهل", "ملاحظة المعلّمة", "الخطة", "الأنشطة", "الملاحظات", "التطور", "التقارير"],
  he: ["סקירה", "מבט ההורים", "תצפית הגננת", "תוכנית", "פעילויות", "תצפיות", "התפתחות", "דוחות"],
};
const TAB_HREFS = [
  "/children/c1",
  "/children/c1/parent-view",
  "/children/c1/teacher-observation",
  "/children/c1/plan",
  "/children/c1/content",
  "/children/c1/observations",
  "/children/c1/development",
  "/children/c1/reports",
];

describe("ChildProfilePage (Overview)", () => {
  const expected: Record<AppLocale, { dir: string; strength: string; interest: string; helps: string; focusTitle: string }> = {
    en: { dir: "ltr", strength: "Imagination", interest: "Cars & transportation", helps: "A hug", focusTitle: "Current focus" },
    ar: { dir: "rtl", strength: "الخيال", interest: "السيارات ووسائل النقل", helps: "حضن", focusTitle: "التركيز الحالي" },
    he: { dir: "rtl", strength: "דמיון", interest: "מכוניות וכלי תחבורה", helps: "חיבוק", focusTitle: "מיקוד נוכחי" },
  };

  for (const locale of ["en", "ar", "he"] as AppLocale[]) {
    it(`renders the 8 tabs in order with Overview active, the lists and numbered focus in ${locale}`, async () => {
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

      // The 8 tabs, in logical order (the track mirrors itself in RTL); only Overview is active.
      const nav = screen.getByRole("navigation", { name: { en: "Child pages", ar: "صفحات الطفل", he: "דפי הילד/ה" }[locale] });
      const tabs = within(nav).getAllByRole("link");
      expect(tabs.map((a) => a.textContent)).toEqual(TAB_LABELS[locale]);
      expect(tabs.map((a) => a.getAttribute("href"))).toEqual(TAB_HREFS);
      expect(tabs.map((a) => a.getAttribute("aria-current"))).toEqual(["page", null, null, null, null, null, null, null]);
      // No numbers dressed up as scores anywhere on the page.
      expect(document.body.textContent).not.toMatch(/\d+\s*%/);
    });
  }

  it("marks the matching tab active on deeper pages", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: detail } } });
    const page = { path: "/children/:id/development/timeline", element: <ChildLayout childId="c1">x</ChildLayout>, roles: ["teacher" as const] };
    renderApp({ routes: [page], url: "/children/c1/development/timeline", user: teacher, options });
    const nav = await screen.findByRole("navigation", { name: "Child pages" });
    expect(within(nav).getByRole("link", { name: "Development" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
  });

  it("never shows the tabs to a parent", async () => {
    const parentChild = { ...detail, view: "parent" as const };
    mockFetch({});
    const page = { path: "/kid/:id", element: <ChildLayout childId="c1" child={parentChild}>hello</ChildLayout> };
    renderApp({ routes: [page], url: "/kid/c1", user: parent, options });
    expect(await screen.findByText("hello")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Child pages" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Export PDF" })).toBeNull();
  });

  it("shows the kindergarten and an Export PDF action that opens the Reports tab", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: detail } } });
    renderApp({ routes, url: "/children/c1", user: teacher, options });
    expect((await screen.findByTestId("child-kindergarten")).textContent).toContain("Sunflower KG");
    expect(screen.getByRole("link", { name: "Export PDF" }).getAttribute("href")).toBe("/children/c1/reports");
  });

  it("links the four main actions and shows the plan and the next review date", async () => {
    const withReview = {
      ...detail,
      focus_areas: [
        { ...detail.focus_areas[0]!, follow_up_on: "2026-11-02" },
        { ...detail.focus_areas[1]!, plan: { review_on: "2026-12-01" } },
      ],
    };
    mockFetch({ "GET /api/children/c1": { body: { child: withReview } } });
    renderApp({ routes, url: "/children/c1", user: teacher, options });
    await screen.findByTestId("section-strengths");
    const href = (name: string) => screen.getAllByRole("link", { name })[0]!.getAttribute("href");
    expect(href("Add observation")).toBe("/children/c1/observe");
    expect(href("View development")).toBe("/children/c1/development");
    expect(href("Edit profile")).toBe("/children/c1/edit/1");
    expect(href("Manage focus")).toBe("/children/c1/plan");
    expect(screen.getAllByRole("link", { name: "Create content" })[0]!.getAttribute("href")).toBe("/children/c1/content/new");
    expect(href("All observations")).toBe("/children/c1/observations");
    expect(href("See the full timeline")).toBe("/children/c1/development/timeline");

    const reviews = screen.getAllByTestId("focus-next-review").map((n) => n.textContent);
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatch(/^Next review: .*2026/);

    fireEvent.click(screen.getByRole("button", { name: "Show plan" }));
    expect(screen.getByText("Build the garage together")).toBeTruthy();
    expect(screen.getByText(/Strength we use/)).toBeTruthy();
  });

  it("shows the heart message, good-to-know and visible provenance badges from the profile", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: detail } },
      "GET /api/children/c1/profile": { body: profile },
      "GET /api/children/c1/teacher-assessments": { body: assessments },
    });
    renderApp({ routes, url: "/children/c1", user: teacher, options: overviewOptions });

    const heart = await screen.findByTestId("section-heart");
    expect(within(heart).getByText("From the heart")).toBeTruthy();
    const message = within(heart).getByText("He is shy at first, give him a minute and he will shine.");
    expect(message.getAttribute("dir")).toBe("auto");
    expect(within(heart).getAllByText("Parent said")).toHaveLength(2);
    expect(within(heart).getByText("Curious")).toBeTruthy();
    // The heart card sits before everything else that describes the child (OM-D99-01 order).
    const order = ["section-heart", "section-good-to-know", "section-strengths", "section-interests", "focus-list", "section-prompts"].map((id) =>
      screen.getByTestId(id),
    );
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const good = screen.getByTestId("section-good-to-know");
    const important = within(good).getByTestId("good-mostImportant");
    expect(important.textContent).toContain("He needs a quiet start to the morning");
    // A parent answer typed in by staff in a meeting says so.
    expect(within(important).getByText("Parent said")).toBeTruthy();
    expect(within(important).getByText(/Entered by/).textContent).toContain("Rana Haddad");
    expect(within(important).getByText(/In a meeting with the family/)).toBeTruthy();
    expect(within(good).getByTestId("good-routines").textContent).toContain("Washes hands before eating");
    expect(within(good).getByTestId("good-overwhelm").textContent).toContain("Loud birthday parties");
    const remember = within(good).getByTestId("good-remember");
    expect(remember.textContent).toContain("Likes to sit near the window");
    expect(within(remember).getByText("Teacher observed")).toBeTruthy();

    // Health: indicators that link to the Parent View, never the text itself.
    expect(within(good).getByTestId("note-food").getAttribute("href")).toBe("/children/c1/parent-view?section=health");
    expect(within(good).getByTestId("note-medical").getAttribute("href")).toBe("/children/c1/parent-view?section=health");
    expect(document.body.textContent).not.toContain("SECRET-FOOD-TEXT");
    expect(document.body.textContent).not.toContain("SECRET-MEDICAL-TEXT");
    const reach = within(good).getByTestId("reach-family");
    expect(reach.textContent).toContain("Phone call · Grandma at pickup");
    expect(reach.textContent).toContain("Short messages");

    // Provenance on every chip, as visible text that matches the API provenance[] (X-22).
    const strengths = screen.getByTestId("section-strengths");
    const main = within(strengths).getByTestId("main-strengths");
    expect(within(main).getByText("Tells long stories")).toBeTruthy();
    const chips = within(strengths).getAllByTestId("profile-chip");
    expect(chips.map((c) => [...c.querySelectorAll("[data-provenance]")].map((b) => b.getAttribute("data-provenance")))).toEqual([
      ["teacher_observed"],
      ["parent_said", "teacher_observed"],
    ]);
    expect(within(chips[1]!).getByText("Parent said")).toBeTruthy();
    expect(within(chips[1]!).getByText("Teacher observed")).toBeTruthy();
    expect(within(screen.getByTestId("section-interests")).getByText("Parent said")).toBeTruthy();
    expect(within(screen.getByTestId("section-what_helps")).getByText("Teacher approved")).toBeTruthy();
    expect(within(strengths).getByText("His kindness to his little sister")).toBeTruthy();

    // Prompts: the open question and the "review later" domain (no quick-baseline prompt: it was started).
    const prompts = screen.getByTestId("section-prompts");
    expect(within(prompts).getByTestId("open-question").textContent).toContain("Does he nap at home?");
    expect(within(prompts).queryByText("Family answers received")).toBeNull();
    const later = within(prompts).getByTestId("review-later");
    expect(within(later).getByRole("link", { name: /Social/ }).getAttribute("href")).toBe("/children/c1/teacher-observation?cycle=a1&domain=social");
    expect(within(later).queryByRole("link", { name: /play/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+\s*%|\bscore\b/i);
  });

  it("derives provenance from sources when the API sends none, and hides the heart card without a message", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: detail } } });
    renderApp({ routes, url: "/children/c1", user: teacher, options });
    const strengths = await screen.findByTestId("section-strengths");
    const chips = within(strengths).getAllByTestId("profile-chip");
    expect([...chips[0]!.querySelectorAll("[data-provenance]")].map((b) => b.getAttribute("data-provenance"))).toEqual(["parent_said", "teacher_observed"]);
    expect(within(screen.getByTestId("section-what_helps")).getAllByText(/Parent said|Teacher observed/).length).toBe(2);
    expect(screen.queryByTestId("section-heart")).toBeNull();
    expect(screen.queryByTestId("section-good-to-know")).toBeNull();
  });

  it("shows the family's own words in What helps (first two, then more) and Interests", async () => {
    const worded: ProfileResponse = {
      ...profile,
      parent_perspective: {
        ...profile.parent_perspective!,
        sections: {
          ...profile.parent_perspective!.sections,
          who: { ...profile.parent_perspective!.sections!.who, what_attracts: "Anything with wheels" },
          joy: { happy_safe_successful: "Building with his father" },
          social: { what_helps_socially: "One friend at a time" },
          behaviour: { what_works: "A calm voice", helps_cooperation: "A choice of two" },
        },
      },
    };
    mockFetch({ "GET /api/children/c1": { body: { child: detail } }, "GET /api/children/c1/profile": { body: worded } });
    renderApp({ routes, url: "/children/c1", user: teacher, options });
    const words = await screen.findByTestId("parent-helps");
    expect(within(words).getByText("Building with his father").getAttribute("dir")).toBe("auto");
    expect(within(words).getByText("One friend at a time")).toBeTruthy();
    expect(within(words).queryByText("A calm voice")).toBeNull();
    expect(within(words).getAllByText("Parent said")).toHaveLength(2);
    fireEvent.click(within(words).getByRole("button", { name: "Show more of the family's words" }));
    expect(within(words).getByText("A calm voice")).toBeTruthy();
    expect(within(words).getByText("A choice of two")).toBeTruthy();
    expect(within(screen.getByTestId("section-interests")).getByText("Anything with wheels")).toBeTruthy();
    const data = overviewData(worded);
    expect(data.parentHelps.map((r) => r.key)).toEqual(["happySafe", "socially", "whatWorks", "cooperation"]);
    expect(data.attracts?.text).toBe("Anything with wheels");
  });

  it("prompts the quick baseline once the family's answers arrived", async () => {
    const fresh: ProfileResponse = {
      child_id: "c1",
      parent_perspective: { sections: {}, questionnaire: { status: "submitted", submitted_at: "2026-09-02T10:00:00Z" } },
      teacher_perspective: { sections: {} },
    };
    mockFetch({ "GET /api/children/c1": { body: { child: detail } }, "GET /api/children/c1/profile": { body: fresh } });
    renderApp({ routes, url: "/children/c1", user: teacher, options });
    expect(await screen.findByText("Family answers received")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quick baseline" }).getAttribute("href")).toBe("/children/c1/quick-baseline");
  });

  it("reads the top-level section statuses and questionnaire of GET /profile", async () => {
    const shaped: ProfileResponse = {
      child_id: "c1",
      parent_perspective: { sections: {} },
      teacher_perspective: { sections: {} },
      questionnaire: { status: "submitted" },
      section_status: { parent: { joy: { status: "review_later" }, who: { status: "sufficient" } }, teacher: { bridge: { status: "in_progress" } } },
    };
    mockFetch({ "GET /api/children/c1": { body: { child: detail } }, "GET /api/children/c1/profile": { body: shaped } });
    renderApp({ routes, url: "/children/c1", user: teacher, options });
    const later = await screen.findByTestId("review-later");
    expect(within(later).getByRole("link", { name: /Family answers/ }).getAttribute("href")).toBe("/children/c1/parent-view?section=joy");
    expect(within(later).getAllByRole("link")).toHaveLength(1);
    // The quick baseline was started, so there is no "Family answers received" prompt.
    expect(screen.queryByText("Family answers received")).toBeNull();
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

describe("overview helpers", () => {
  it("reads answers in both shapes and never repeats the heart message as 'most important'", () => {
    const data = overviewData({
      child_id: "c1",
      parent_perspective: {
        sections: { heart: { message: "Same words" }, priorities: { one_thing_to_know: "Same words" }, separation: { transition_object: { value: "no", text: "x" } } },
      },
    });
    expect(data.heart?.message).toBe("Same words");
    expect(data.goodToKnow).toEqual([]);
    expect(overviewData(undefined).goodToKnow).toEqual([]);
    expect(textOf({ value: "yes", text: "  Teddy " })).toBe("Teddy");
    expect(textOf("   ")).toBeNull();
  });

  it("nextReviewOn prefers follow_up_on and accepts only ISO legacy dates", () => {
    expect(nextReviewOn({ follow_up_on: "2026-11-02", plan: { review_on: "2026-12-01" } })).toBe("2026-11-02");
    expect(nextReviewOn({ plan: { review_on: "2026-12-01" } })).toBe("2026-12-01");
    expect(nextReviewOn({ plan: { review_on: "after the holidays" } })).toBeNull();
  });

  it("derives labels like app/provenance.py", () => {
    expect(deriveFromSources(["observation", "parent", "review", "teacher"]).sort()).toEqual(["parent_said", "teacher_approved", "teacher_observed"]);
    expect(itemProvenance({ key: "x", sources: ["parent"], provenance: ["ai_suggested"] })).toEqual(["ai_suggested"]);
    expect(parentSaid({ by_name: "Rana", role: "teacher", reported_by: "parent", mode: "on_behalf" })).toEqual({
      label: "parent_said",
      entered_by: "Rana",
      mode: "on_behalf",
      at: null,
    });
    expect(parentSaid({ by_name: "Huda", role: "parent" })).toBe("parent_said");
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adam } from "@/features/observations/testData";
import type { QProfile } from "@/features/wizard/questionnaire";
import type { AppLocale } from "@/i18n/config";
import { normalizeOptions } from "@/lib/options";
import { clearSourceModelCache, primeSourceModel } from "@/lib/sourceModel";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";
import { overviewData } from "@/features/children/overview";
import type { ProfileResponse } from "@/features/children/types";
import { routes } from "./routes";

/** WP2-PQ: the Parent View tab (the family's complete questionnaire, read-only, PV §5.3). */

const DATA = resolve(process.cwd(), "../backend/app/data");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const registry = read(`${DATA}/source/parent_questionnaire.json`);
const rawOptions = read(`${DATA}/options.json`);
const fragments = readdirSync(`${DATA}/lists`)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => read(`${DATA}/lists/${f}`).lists as Record<string, unknown>);
const options = normalizeOptions({ lists: Object.assign({}, ...fragments, rawOptions.lists) });

type Localized = Record<AppLocale, string>;
const sections = (registry.sections as { key: string; kind: string; order: number; label: Localized }[])
  .filter((s) => s.kind === "parent")
  .sort((a, b) => a.order - b.order);
const label = (key: string, locale: AppLocale) => sections.find((s) => s.key === key)!.label[locale];

const HEART = "He is brave and loves the garden.";
const SLEEP = "Falls asleep with a story.";
const FAMILY = "Grandma lives with us.";

const profile: QProfile = {
  child_id: "c1",
  perspective: "teacher",
  parent_perspective: {
    sections: {
      who: { appreciate: "His kindness", describe_words: [{ key: "curious" }] },
      joy: { not_answered: ["likes_at_home"], happy_safe_successful: "Building with blocks" },
      emotions: { morning_separation: "needs_time" },
      health: { sleep: SLEEP },
      partnership: { family_context: FAMILY },
      heart: { message: HEART },
    },
    entered: {
      who: [{ by: "u-teacher", by_name: "Rana Haddad", role: "teacher", reported_by: "parent", at: "2026-10-01T08:00:00Z", mode: "meeting" }],
      heart: [{ by: "u-parent", by_name: "Dana Levi", role: "parent", reported_by: "parent", at: "2026-10-02T08:00:00Z", mode: "self" }],
    },
    section_status: { who: { status: "sufficient" }, heart: { status: "sufficient" } },
    questionnaire: { status: "submitted", submitted_at: "2026-10-02T08:00:00Z", filled_at: "2026-10-01", entry_mode: "meeting", meeting: { date: "2026-10-01", attendees: ["mother"] } },
    wizard: { step: 9, completed_at: "2026-10-02T08:00:00Z" },
  },
  teacher_perspective: { sections: {}, entered: {} },
  questionnaire: { status: "submitted", submitted_at: "2026-10-02T08:00:00Z", filled_at: "2026-10-01", entry_mode: "meeting", meeting: { date: "2026-10-01", attendees: ["mother"] } },
  section_status: { parent: { who: { status: "sufficient" }, heart: { status: "sufficient" } }, teacher: {} },
  strengths: [],
  interests: [],
  what_helps: [],
  wizard: { step: 1, completed_at: null },
  has_baseline: false,
};

const history = {
  versions: [
    { id: 1, seq: 1, key: "parent:heart", data: { message: "First words" }, changed_by_name: "Dana Levi", changed_role: "parent", reported_by: "parent", via: "self", created_at: "2026-10-01T08:00:00Z", initial: true },
    { id: 2, seq: 2, key: "parent:heart", data: { message: HEART }, changed_by_name: "Dana Levi", changed_role: "parent", reported_by: "parent", via: "self", created_at: "2026-10-03T08:00:00Z", initial: false },
  ],
  initial: { "parent:heart": 1 },
  submitted_at: "2026-10-02T08:00:00Z",
  questionnaire_status: "submitted",
};

function setup() {
  return mockFetch({
    "GET /api/children/c1": { body: { child: adam } },
    "GET /api/children/c1/profile": { body: profile },
    "GET /api/children/c1/profile/history": { body: history },
  });
}

const section = (key: string) => document.querySelector(`[data-section="${key}"]`) as HTMLElement;

beforeEach(() => {
  clearSourceModelCache();
  primeSourceModel({ parent_questionnaire: registry, observation_model: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("Parent View", () => {
  it.each(["en", "he", "ar"] as AppLocale[])("renders every questionnaire section in source order in %s", async (locale) => {
    setup();
    renderApp({ routes, url: "/children/c1/parent-view", user: { ...teacher, language: locale }, locale, options });
    await screen.findByTestId("parent-view");
    const shown = [...document.querySelectorAll("[data-section]")].map((el) => el.getAttribute("data-section"));
    expect(shown).toEqual(sections.map((s) => s.key));
    for (const s of sections) expect(within(section(s.key)).getAllByText(label(s.key, locale)).length).toBeGreaterThan(0);
    expect(document.documentElement.dir).toBe(locale === "en" ? "ltr" : "rtl");
    expect(document.body.textContent).not.toMatch(/\d+\s*%/);
  });

  it("shows the heart message, statuses, Not answered markers, Private badges and who entered the answers", async () => {
    setup();
    renderApp({ routes, url: "/children/c1/parent-view", user: teacher, options });
    await screen.findByTestId("parent-view");

    expect(within(section("heart")).getByText(HEART)).toBeTruthy();
    expect(section("intro").querySelector('[data-status="sufficient"]')).toBeTruthy();
    expect(within(section("intro")).getAllByText("Enough for now").length).toBeGreaterThan(0);
    expect(section("behaviour").querySelector('[data-status="not_started"]')).toBeTruthy();

    // Skipped and empty questions are marked, never left blank.
    expect(section("joy").querySelectorAll('[data-marker="not-answered"]').length).toBeGreaterThan(0);
    expect(within(section("joy")).getByText("Building with blocks")).toBeTruthy();

    // Health and the family question are private (collapsed with a badge); the answers are still kept.
    expect(within(section("health")).getAllByText("Private").length).toBeGreaterThan(0);
    expect(within(section("health")).getByText(SLEEP)).toBeTruthy();
    const q41 = section("partnership").querySelector('[data-item="PQ-PRT-04"]') as HTMLElement;
    expect(within(q41).getByText("Private")).toBeTruthy();
    expect(within(q41).getByText(FAMILY)).toBeTruthy();

    // Parent said, entered by staff in a meeting.
    const who = section("intro");
    expect(within(who).getByText("Parent said")).toBeTruthy();
    expect(who.querySelector("[data-entered-by]")!.textContent).toMatch(/Entered by Rana Haddad.*In a meeting with the family/);

    // Answers that only exist in the earlier form.
    expect(within(section("emotions")).getByTestId("earlier-form")).toBeTruthy();

    // Staff entry points.
    expect(screen.getByRole("link", { name: "Enter the family's answers" }).getAttribute("href")).toBe("/children/c1/parent-view/answers/9?mode=on_behalf");
    expect(screen.getByRole("link", { name: "Fill in together with the family" }).getAttribute("href")).toBe("/children/c1/parent-view/answers/1?mode=meeting");
    expect(screen.getByRole("link", { name: "Open the quick baseline" }).getAttribute("href")).toBe("/children/c1/quick-baseline");
  });

  it("switches to the answers as first sent and opens a section's history", async () => {
    const fetch = setup();
    renderApp({ routes, url: "/children/c1/parent-view", user: teacher, options });
    await screen.findByTestId("parent-view");

    fireEvent.click(screen.getByRole("radio", { name: "As first sent" }));
    await waitFor(() => expect(within(section("heart")).getByText("First words")).toBeTruthy());
    expect(within(section("heart")).queryByText(HEART)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Latest answers" }));
    expect(within(section("heart")).getByText(HEART)).toBeTruthy();

    fireEvent.click(within(section("heart")).getByRole("button", { name: "History" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.querySelectorAll("[data-version]").length).toBe(2));
    expect(within(dialog).getByText("First sent")).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/profile/history") && String(url).includes("section=heart"))).toBe(true);
  });

  it("lets staff set a section to Review later (status only), which the Overview then lists", async () => {
    let sent: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/profile": { body: profile },
      "PATCH /api/children/c1/profile": (init) => {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const status = { ...profile.section_status!.parent, [String(sent.section)]: { status: sent.status } };
        return { body: { ...profile, parent_perspective: { ...profile.parent_perspective, section_status: status }, section_status: { parent: status, teacher: {} } } };
      },
    });
    renderApp({ routes, url: "/children/c1/parent-view", user: teacher, options });
    await screen.findByTestId("parent-view");
    const joy = section("joy");
    fireEvent.click(within(within(joy).getByTestId("section-status")).getByRole("radio", { name: "Review later" }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toEqual({ perspective: "parent", section: "joy", status: "review_later" });
    await waitFor(() => expect(joy.querySelector('[data-status="review_later"]')).toBeTruthy());
    const saved = { ...profile, section_status: { parent: { ...profile.section_status!.parent, joy: { status: "review_later" } }, teacher: {} } };
    expect(overviewData(saved as unknown as ProfileResponse).reviewLater).toContainEqual({ perspective: "parent", section: "joy" });
  });

  it("is staff only", async () => {
    setup();
    renderApp({ routes, url: "/children/c1/parent-view", user: parent, options });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("parent-view")).toBeNull();
  });
});

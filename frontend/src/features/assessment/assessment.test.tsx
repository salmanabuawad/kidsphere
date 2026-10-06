import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppLocale } from "@/i18n/config";
import { normalizeOptions } from "@/lib/options";
import { clearSourceModelCache, primeSourceModel } from "@/lib/sourceModel";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { adam } from "@/features/observations/testData";
import type { Assessment } from "./api";
import { routes } from "./routes";
import { routes as observeRoutes } from "@/features/observations/routes";

/** WP2-TO: the Teacher Observation tab (13 section cards, 4-tap levels, D8/D9/D10/D13 specifics, cycles). */

const DATA = resolve(process.cwd(), "../backend/app/data");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const registry = read(`${DATA}/source/observation_model.json`);
const rawOptions = read(`${DATA}/options.json`);
const fragments = readdirSync(`${DATA}/lists`)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => read(`${DATA}/lists/${f}`).lists as Record<string, unknown>);
const options = normalizeOptions({ lists: Object.assign({}, ...fragments, rawOptions.lists) });
const banned = rawOptions.banned_terms as Record<string, Record<string, string[]>>;

const SCORING = /\d+\s*%|\bscore\b|\bpoints\b/i;
const AGE_NORM = ["בהתאם לגיל", "מותאם לגיל", "age-appropriate", "for their age", "حسب العمر", "المناسب لعمره"];

function cycle(over: Partial<Assessment> = {}): Assessment {
  return {
    id: "a1",
    child_id: "c1",
    kind: "initial",
    number: 1,
    previous_id: null,
    status: "open",
    filled_on: "2026-10-01",
    period_from: "2026-09-01",
    period_to: "2026-10-01",
    period_note: null,
    teacher_id: "u-teacher",
    teacher_name: "Rana Haddad",
    filled_by_text: null,
    child_snapshot: {
      name: "Adam",
      birth_date: "2022-08-05",
      age_at_fill: { years: 4, months: 1 },
      class_name: "Class A",
      kindergarten: "Sunflower KG",
      teacher_name: "Rana Haddad",
    },
    created_by: "u-teacher",
    created_by_name: "Rana Haddad",
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    closed_by: null,
    closed_by_name: null,
    closed_at: null,
    domains: {
      social: {
        status: "sufficient",
        data: { items: { joins_existing_play: { level: "independent" } } },
        entry_id: "e1",
        updated_at: "2026-10-02T08:00:00Z",
        updated_by: "u-teacher",
        updated_by_name: "Rana Haddad",
        provenance: ["teacher_observed"],
      },
    },
    need_focus_areas: [],
    ...over,
  };
}

const profile = {
  parent_perspective: {
    sections: {
      independence: { levels_pq: { eating: "needs_help" } },
      emotions: { morning_separation: "needs_time", calming_helps: ["hug"] },
    },
  },
};

function setup(handlers: Record<string, Parameters<typeof mockFetch>[0][string]> = {}, current: Assessment | null = cycle()) {
  return mockFetch({
    "GET /api/children/c1": { body: { child: adam } },
    "GET /api/children/c1/profile": { body: profile },
    "GET /api/children/c1/teacher-assessments": { body: { current, earlier: [] } },
    "GET /api/children/c1/observations": { body: { observations: [], limit: 3, offset: 0, has_more: false } },
    ...handlers,
  });
}

function open(url: string, locale: AppLocale = "en") {
  return renderApp({ routes, url, user: { ...teacher, language: locale }, locale, options });
}

function card(domain: string) {
  return document.querySelector(`[data-domain="${domain}"]`) as HTMLElement;
}

beforeEach(() => {
  clearSourceModelCache();
  primeSourceModel({ observation_model: registry, parent_questionnaire: {} });
});

describe("Teacher Observation tab", () => {
  it.each(["en", "he", "ar"] as AppLocale[])("renders the 13 cards in %s with registry labels and no banned, age-norm or score wording", async (locale) => {
    setup();
    open("/children/c1/teacher-observation?domain=language", locale);
    await waitFor(() => expect(document.querySelectorAll("[data-domain]").length).toBe(13));
    expect(document.documentElement.dir).toBe(locale === "en" ? "ltr" : "rtl");
    const item = (id: string) => registry.items.find((i: { id: string }) => i.id === id);
    // D3 is open: both sub-groups and every indicator, in the UI language.
    for (const id of ["OM-D03-R", "OM-D03-E", "OM-D03-01", "OM-D03-05", "OM-D03-14"]) expect(screen.getAllByText(item(id).label[locale]).length).toBeGreaterThan(0);
    // The verbatim source wording (with age-norm phrasing) is never shown.
    expect(document.body.textContent).not.toContain(item("OM-D03-05").source_he);
    expect(card("social").querySelector("[data-status]")!.getAttribute("data-status")).toBe("sufficient");
    expect(card("emotional").querySelector("[data-status]")!.getAttribute("data-status")).toBe("not_started");

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(SCORING);
    for (const phrase of AGE_NORM) expect(text).not.toContain(phrase);
    let cleaned = text.toLowerCase();
    for (const lang of ["en", "ar", "he"]) for (const p of banned.allow_phrases[lang] ?? []) cleaned = cleaned.split(p.toLowerCase()).join(" ");
    const hits = ["clinical", "child_deficit"].flatMap((g) => (banned[g]![locale] ?? []).filter((term) => cleaned.includes(term.toLowerCase())));
    expect(hits).toEqual([]);
    cleanup();
  });

  it("the 4-tap level control sets, saves and clears a level with a note", async () => {
    let sent: { status: string; data: Record<string, unknown> } | null = null;
    setup({
      "PUT /api/teacher-assessments/a1/domains/social": (init) => {
        sent = JSON.parse(String(init?.body));
        return {
          body: {
            domain: "social",
            status: sent!.status,
            data: sent!.data,
            entry_id: "e2",
            updated_at: "2026-10-03T08:00:00Z",
            updated_by_name: "Rana Haddad",
            provenance: ["teacher_observed"],
            warnings: [],
          },
        };
      },
    });
    open("/children/c1/teacher-observation?domain=social");
    const row = await waitFor(() => {
      const el = document.querySelector('[data-item="initiates_contact"]') as HTMLElement;
      expect(el).toBeTruthy();
      return el;
    });
    const scale = within(row).getByRole("radiogroup", { name: /Starts contact with other children: how much support was needed\?/ });
    const radios = within(scale).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Independent", "With support", "Difficult", "Not observed"]);
    fireEvent.click(within(scale).getByRole("radio", { name: "With support" }));
    expect(within(scale).getByRole("radio", { name: "With support" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(row).getByRole("button", { name: /Add a note/ }));
    fireEvent.change(within(row).getByLabelText("Note: Starts contact with other children"), { target: { value: "With a friend nearby" } });
    // Tapping the chosen level again clears it; tapping another sets it.
    fireEvent.click(within(scale).getByRole("radio", { name: "Difficult" }));
    fireEvent.click(within(scale).getByRole("radio", { name: "Difficult" }));
    expect(within(scale).getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    fireEvent.click(within(scale).getByRole("radio", { name: "With support" }));
    // Parent hint next to the matching item, labelled as the parent's.
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Review later" }));
    fireEvent.click(screen.getByRole("button", { name: "Save this area" }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toEqual({
      status: "review_later",
      data: {
        items: {
          joins_existing_play: { level: "independent" },
          initiates_contact: { level: "some_support", note: "With a friend nearby" },
        },
      },
    });
    expect(await screen.findByText("Saved")).toBeTruthy();
    await waitFor(() => expect(card("social").querySelector("[data-status]")!.getAttribute("data-status")).toBe("review_later"));
  });

  it("shows parent answers beside matching items and never copies them", async () => {
    setup();
    open("/children/c1/teacher-observation?domain=emotional");
    const row = await waitFor(() => {
      const el = document.querySelector('[data-item="copes_with_separation"]') as HTMLElement;
      expect(el).toBeTruthy();
      return el;
    });
    const hint = row.querySelector('[data-hint="parent"]') as HTMLElement;
    expect(hint.querySelector('[data-provenance="parent_said"]')).toBeTruthy();
    expect(hint.textContent).toContain("Needs some time");
    expect(within(row).getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("D8 offers Independent / Needs help first; More adds the other levels; the parent column shows", async () => {
    setup();
    open("/children/c1/teacher-observation?domain=independence");
    const row = await waitFor(() => {
      const el = document.querySelector('[data-item="eating"]') as HTMLElement;
      expect(el).toBeTruthy();
      return el;
    });
    expect(within(row).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Independent", "Needs help"]);
    expect((row.querySelector('[data-hint="parent"]') as HTMLElement).textContent).toContain("Needs help");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(within(row).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Independent", "With support", "Difficult", "Not observed"]);
    expect(card("independence").querySelectorAll("[data-item]").length).toBe(8);
  });

  it("D9 has effect chips and no support level; D10 shows the play-not-test line", async () => {
    setup();
    open("/children/c1/teacher-observation?domain=sensory");
    const row = await waitFor(() => {
      const el = document.querySelector('[data-item="noise"]') as HTMLElement;
      expect(el).toBeTruthy();
      return el;
    });
    expect(within(row).queryByRole("radio", { name: "Independent" })).toBeNull();
    expect(within(row).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "Seems to affect the child",
      "Sometimes affects the child",
      "No visible effect",
      "Not observed yet",
    ]);
    fireEvent.click(within(card("cognitive")).getByRole("button", { expanded: false }));
    expect(await screen.findByText("Observed through play and daily activity, not a test")).toBeTruthy();
    expect(card("sensory").querySelector('[data-item="noise"]')).toBeNull(); // one card open at a time
  });

  it("D13 turns a saved need into a Current Focus", async () => {
    let calls = 0;
    const withNeed = cycle({
      domains: { priority_needs: { status: "in_progress", data: { needs: [{ area: "social", seeing: "Waits at the edge of play" }] }, entry_id: "e9", updated_at: null, updated_by: null, updated_by_name: null, provenance: ["teacher_observed"] } },
    });
    const promoted = { ...withNeed, need_focus_areas: [{ index: 0, area: "social", focus_area_id: "f9", title: "Social", status: "active" }] };
    setup({
      "GET /api/children/c1/teacher-assessments": () => ({ body: { current: calls > 0 ? promoted : withNeed, earlier: [] } }),
      "POST /api/teacher-assessments/a1/needs/0/focus": () => {
        calls += 1;
        return { status: 201, body: { focus_area: { id: "f9", title: "Social" } } };
      },
    });
    open("/children/c1/teacher-observation?domain=priority_needs");
    const need = await waitFor(() => {
      const el = document.querySelector('[data-need="social"]') as HTMLElement;
      expect(el).toBeTruthy();
      return el;
    });
    expect((within(need).getByLabelText("What exactly are we seeing?") as HTMLTextAreaElement).value).toBe("Waits at the edge of play");
    fireEvent.click(within(need).getByRole("button", { name: "Make it a Current Focus" }));
    expect(await screen.findByText("Current Focus: Social")).toBeTruthy();
    expect(calls).toBe(1);
    // At most 3 areas: the other chips are disabled once three are marked.
    const chips = within(card("priority_needs")).getByRole("group", { name: "Mark up to 3 main areas" });
    fireEvent.click(within(chips).getByRole("button", { name: /Language/ }));
    fireEvent.click(within(chips).getByRole("button", { name: /Independence/ }));
    expect((within(chips).getByRole("button", { name: /Emotional/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("You can mark up to 3 areas.")).toBeTruthy();
    expect((screen.getAllByRole("button", { name: "Make it a Current Focus" })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("FOCUS_LIMIT shows the localized message", async () => {
    const withNeed = cycle({
      domains: { priority_needs: { status: "in_progress", data: { needs: [{ area: "language" }] }, entry_id: "e9", updated_at: null, updated_by: null, updated_by_name: null, provenance: [] } },
    });
    setup(
      { "POST /api/teacher-assessments/a1/needs/0/focus": { status: 409, body: { error: { code: "FOCUS_LIMIT", message: "x", details: null } } } },
      withNeed,
    );
    open("/children/c1/teacher-observation?domain=priority_needs");
    fireEvent.click(await screen.findByRole("button", { name: "Make it a Current Focus" }));
    expect(await screen.findByText(/up to 3 active focus areas/)).toBeTruthy();
  });

  it("starts the first observation from the empty state", async () => {
    let started: Record<string, unknown> | null = null;
    let created = false;
    setup({
      "GET /api/children/c1/teacher-assessments": () => ({ body: { current: created ? cycle({ domains: {} }) : null, earlier: [] } }),
      "POST /api/children/c1/teacher-assessments": (init) => {
        started = JSON.parse(String(init?.body));
        created = true;
        return { status: 201, body: { assessment: cycle({ domains: {} }) } };
      },
    });
    open("/children/c1/teacher-observation");
    fireEvent.click(await screen.findByRole("button", { name: "Start the teacher observation" }));
    await waitFor(() => expect(document.querySelectorAll("[data-domain]").length).toBe(13));
    expect(started).toEqual({});
    expect(screen.getByText("Child details")).toBeTruthy();
    expect(screen.getByText("4 years 1 month")).toBeTruthy();
    expect(screen.getByText("Initial observation")).toBeTruthy();
  });

  it("a closed observation is read-only and a reassessment can start from the earlier answers", async () => {
    let body: Record<string, unknown> | null = null;
    setup(
      {
        "POST /api/children/c1/teacher-assessments": (init) => {
          body = JSON.parse(String(init?.body));
          return { status: 201, body: { assessment: cycle({ id: "a2", kind: "reassessment", number: 2, previous_id: "a1" }) } };
        },
      },
      cycle({ status: "closed", closed_at: "2026-10-04T08:00:00Z", closed_by: "u-teacher" }),
    );
    open("/children/c1/teacher-observation?domain=social");
    expect(await screen.findByText("This observation is closed, so this area is read-only.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save this area" })).toBeNull();
    const row = document.querySelector('[data-item="initiates_contact"]') as HTMLElement;
    expect(within(row).getAllByRole("radio").every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: "Edit observation details" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close this observation" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start a reassessment" }));
    const dialog = await screen.findByRole("dialog", { name: "Start a reassessment" });
    expect((within(dialog).getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Start a reassessment" }));
    await waitFor(() => expect(body).toEqual({ copy_forward: true }));
  });

  it("the How to observe card shows the 7 principles once, then folds to one line", async () => {
    setup();
    open("/children/c1/teacher-observation");
    const toggle = await screen.findByRole("button", { name: "How to observe" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    for (const p of options.observation_principles!) expect(screen.getByText(p.label.en!)).toBeTruthy();
    expect(screen.getByText(/It is not a medical or clinical diagnosis\./)).toBeTruthy();
    cleanup();
    setup();
    window.localStorage.setItem("ks_to_guide_seen", "1");
    open("/children/c1/teacher-observation");
    expect((await screen.findByRole("button", { name: "How to observe" })).getAttribute("aria-expanded")).toBe("false");
  });

  it("What to look for next shows the latest AI questions (AI suggested) and opens the quick form with one", async () => {
    let sent: Record<string, unknown> | null = null;
    setup({
      "GET /api/children/c1/ai-suggestions": {
        body: {
          suggestions: [
            { id: "s2", kind: "functional_summary", output: { next_observation_questions: [] } },
            {
              id: "s1",
              kind: "understanding",
              output: {
                next_observation_questions: [
                  { domain: "social", question: "How does [child] join a game that has already started?" },
                  { domain: "play", question: "Which games keep [child] busy the longest?" },
                ],
              },
            },
          ],
        },
      },
      "POST /api/children/c1/observations": (init) => {
        sent = JSON.parse(String(init?.body));
        return { status: 201, body: { observation: { id: "o1", ...sent } } };
      },
    });
    renderApp({ routes: [...routes, ...observeRoutes], url: "/children/c1/teacher-observation", user: teacher, options });
    const box = (await waitFor(() => {
      const el = document.querySelector("[data-next-questions]");
      expect(el).not.toBeNull();
      return el;
    })) as HTMLElement;
    expect(within(box).getByText("What to look for next")).toBeTruthy();
    expect(box.querySelector('[data-provenance="ai_suggested"]')).not.toBeNull();
    expect(within(box).getByText("How does Adam join a game that has already started?")).toBeTruthy();
    expect(box.textContent).not.toContain("[child]");
    expect(box.textContent).not.toMatch(SCORING);

    fireEvent.click(within(box).getAllByRole("link", { name: "Observe this" })[0]!);
    const reminder = (await waitFor(() => {
      const el = document.querySelector("[data-look-for]");
      expect(el).not.toBeNull();
      return el;
    })) as HTMLElement;
    expect(within(reminder).getByText("How does Adam join a game that has already started?")).toBeTruthy();
    expect(reminder.querySelector('[data-provenance="ai_suggested"]')).not.toBeNull();
    fireEvent.change(screen.getByLabelText(/What happened\?/), { target: { value: "Watched, then asked to join" } });
    fireEvent.click(screen.getByRole("button", { name: /Save observation/ }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({ observation: "Watched, then asked to join", domains: ["social"] });
  });

  it("What to look for next stays hidden without AI questions", async () => {
    setup({ "GET /api/children/c1/ai-suggestions": { body: { suggestions: [] } } });
    open("/children/c1/teacher-observation");
    await waitFor(() => expect(document.querySelectorAll("[data-domain]").length).toBe(13));
    expect(document.querySelector("[data-next-questions]")).toBeNull();
  });
});

describe("first area to observe (PQ-TCH-06)", () => {
  it("marks the section the quick baseline names, and only that one", async () => {
    setup({
      "GET /api/children/c1/profile": {
        body: { ...profile, teacher_perspective: { sections: { bridge: { first_area_to_observe: { domain: "social", note: "Joining play" } } } } },
      },
    });
    open("/children/c1/teacher-observation");
    await waitFor(() => expect(within(card("social")).queryByText("First area to observe")).toBeTruthy());
    expect(within(card("play")).queryByText("First area to observe")).toBeNull();
    expect(screen.getAllByText("First area to observe")).toHaveLength(1);
  });
});

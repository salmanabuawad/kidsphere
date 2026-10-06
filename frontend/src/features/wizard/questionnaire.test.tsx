import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes as parentViewRoutes } from "@/features/parent-view/routes";
import type { AppLocale } from "@/i18n/config";
import { normalizeOptions } from "@/lib/options";
import { clearSourceModelCache, primeSourceModel } from "@/lib/sourceModel";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";
import type { QProfile } from "./questionnaire";
import { routes as wizardRoutes } from "./routes";

/** WP2-PQ: the family's questionnaire as 9 steps (PW1–PW9), for the parent and for staff (on behalf / meeting). */

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
type Item = { id: string; section: string; step?: number; kind: string; part_of?: string; label: Localized; source_he?: string };
const items = registry.items as Item[];
const item = (id: string) => items.find((i) => i.id === id)!;
const steps = registry.meta.steps as { step: number; sections: string[]; label: Localized }[];
const STEP_OF: Record<AppLocale, (n: number) => string> = {
  en: (n) => `Step ${n} of 9`,
  he: (n) => `שלב ${n} מתוך 9`,
  ar: (n) => `الخطوة ${n} من 9`,
};

const routes = [...wizardRoutes, ...parentViewRoutes];
const child = {
  child: {
    id: "c1",
    name: "Adam Haddad",
    preferred_name: "Adam",
    birth_date: "2022-08-05",
    gender: "boy",
    class: { id: "k1", name: "Butterflies", kindergarten: "Sunflower KG" },
    main_language: "ar",
    additional_languages: [],
    parent_name: null,
    parent_contact: null,
  },
};

function parentProfile(over: Partial<QProfile> = {}): QProfile {
  return {
    child_id: "c1",
    perspective: "parent",
    parent_perspective: { sections: {}, entered: {} },
    questionnaire: null,
    wizard: { step: 1, completed_at: null },
    ...over,
  };
}

function staffProfile(over: Partial<QProfile> = {}): QProfile {
  return {
    ...parentProfile(),
    perspective: "teacher",
    teacher_perspective: { sections: {}, entered: {} },
    section_status: { parent: {}, teacher: {} },
    strengths: [],
    interests: [],
    what_helps: [],
    has_baseline: false,
    ...over,
  };
}

function setup(profile: QProfile, onPatch?: (body: Record<string, unknown>) => QProfile) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = mockFetch({
    "GET /api/children/c1/profile": { body: profile },
    "GET /api/children/c1": { body: child },
    "PATCH /api/children/c1/profile": (init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return { body: onPatch ? onPatch(body) : profile };
    },
  });
  return { bodies, fetch };
}

const question = (id: string) => document.querySelector(`[data-question="${id}"]`) as HTMLElement | null;

beforeEach(() => {
  clearSourceModelCache();
  primeSourceModel({ parent_questionnaire: registry, observation_model: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("the family's questionnaire (parent)", () => {
  it.each(["en", "he", "ar"] as AppLocale[])(
    "walks through the 9 steps in source order in %s, with registry labels and never the verbatim source",
    async (locale) => {
      let step = 1;
      const { bodies } = setup(parentProfile(), (body) => {
        step = Number(body.wizard_step ?? step);
        return parentProfile({ wizard: { step, completed_at: null } });
      });
      const { router } = renderApp({ routes, url: "/parent/children/c1/onboarding/1", user: { ...parent, language: locale }, locale, options });

      expect(await screen.findByText(STEP_OF[locale](1))).toBeTruthy();
      expect(document.documentElement.dir).toBe(locale === "en" ? "ltr" : "rtl");
      // One progress segment per step, named after the step.
      for (const s of steps) expect(screen.getAllByRole("button", { name: s.label[locale] }).length).toBeGreaterThan(0);

      for (const s of steps) {
        await waitFor(() => expect(router.state.location.pathname).toBe(`/parent/children/c1/onboarding/${s.step}`));
        expect(await screen.findByText(STEP_OF[locale](s.step))).toBeTruthy();
        expect(screen.getByRole("heading", { level: 1, name: s.label[locale] })).toBeTruthy();
        // Every question of the step is there, in registry order, labelled in the UI language.
        const expected = items
          .filter((i) => i.step === s.step && s.sections.includes(i.section) && !i.part_of && !["display", "record"].includes(i.kind))
          .filter((i) => !("show_if" in i))
          .map((i) => i.id);
        const shown = [...document.querySelectorAll("[data-question]")].map((el) => el.getAttribute("data-question"));
        expect(shown.filter((id) => expected.includes(id!))).toEqual(expected);
        for (const id of expected) {
          expect(within(question(id)!).getAllByText(item(id).label[locale], { exact: false }).length).toBeGreaterThan(0);
          const src = item(id).source_he;
          if (src && !Object.values(item(id).label).some((l) => l.includes(src))) expect(document.body.textContent).not.toContain(src);
        }
        if (s.step < 9) fireEvent.click(screen.getByTestId("questionnaire-next"));
      }
      expect(screen.getByTestId("questionnaire-send")).toBeTruthy();
      // Moving on only saves the step: nothing was answered.
      expect(bodies.every((b) => b.section === undefined && b.perspective === "parent")).toBe(true);
    },
    30_000,
  );

  it("shows the privacy notice on the health step (PW6) and next to the family question (PW8)", async () => {
    setup(parentProfile({ wizard: { step: 6, completed_at: null } }));
    const { router } = renderApp({ routes, url: "/parent/children/c1/onboarding/6", user: parent, options });
    await screen.findByText(STEP_OF.en(6));
    const health = document.querySelector('[data-section="health"]') as HTMLElement;
    const section = (registry.sections as { key: string; notice?: Localized }[]).find((s) => s.key === "health")!;
    expect(within(health).getByText(section.notice!.en)).toBeTruthy();
    expect(within(health).getAllByText("Private").length).toBeGreaterThan(0);

    await router.navigate("/parent/children/c1/onboarding/8");
    await screen.findByText(STEP_OF.en(8));
    const q41 = question("PQ-PRT-04")!;
    expect(within(q41).getByText("Private")).toBeTruthy();
    expect(within(q41).getByText((registry.items as { id: string; notice?: Localized }[]).find((i) => i.id === "PQ-PRT-04")!.notice!.en)).toBeTruthy();
  });

  it("opens follow-up questions only after yes / sometimes / other", async () => {
    setup(parentProfile({ wizard: { step: 3, completed_at: null } }));
    const { router } = renderApp({ routes, url: "/parent/children/c1/onboarding/3", user: parent, options });
    await screen.findByText(STEP_OF.en(3));

    // Q12 "yes" opens "Which situations?" and the follow-up for the teacher.
    expect(question("PQ-EMO-07")).toBeNull();
    const q12 = question("PQ-EMO-06")!;
    expect(within(q12).queryByRole("textbox")).toBeNull();
    fireEvent.click(within(q12).getByRole("radio", { name: "No" }));
    expect(question("PQ-EMO-07")).toBeNull();
    fireEvent.click(within(q12).getByRole("radio", { name: "Yes" }));
    expect(within(q12).getByRole("textbox")).toBeTruthy();
    expect(question("PQ-EMO-07")).toBeTruthy();

    // Q3 interests: the "Other" box opens only after choosing Other.
    await router.navigate("/parent/children/c1/onboarding/2");
    await screen.findByText(STEP_OF.en(2));
    const q3 = question("PQ-INTRO-07")!;
    expect(within(q3).queryByRole("textbox")).toBeNull();
    fireEvent.click(within(q3).getByRole("button", { name: /Other/ }));
    expect(within(q3).getByRole("textbox")).toBeTruthy();

    // Q35 "sometimes" opens "What kind of preparation helps?".
    await router.navigate("/parent/children/c1/onboarding/7");
    await screen.findByText(STEP_OF.en(7));
    expect(question("PQ-TRN-03")).toBeNull();
    fireEvent.click(within(question("PQ-TRN-02")!).getByRole("radio", { name: "Sometimes" }));
    expect(question("PQ-TRN-03")).toBeTruthy();
  });

  it("saves a skipped question as not answered and the answers of the step on Next", async () => {
    const { bodies } = setup(parentProfile(), (body) => parentProfile({ wizard: { step: Number(body.wizard_step), completed_at: null } }));
    const { router } = renderApp({ routes, url: "/parent/children/c1/onboarding/1", user: parent, options });
    await screen.findByText(STEP_OF.en(1));

    const q2 = question("PQ-INTRO-06")!;
    fireEvent.click(within(q2).getByRole("button", { name: "Skip this question" }));
    expect(q2.querySelector('[data-marker="not-answered"]')).toBeTruthy();
    fireEvent.change(within(question("PQ-INTRO-02")!).getByRole("textbox", { name: "Name" }), { target: { value: "Dana Levi" } });
    fireEvent.click(screen.getByTestId("questionnaire-next"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/parent/children/c1/onboarding/2"));
    expect(bodies).toEqual([
      { perspective: "parent", section: "who", data: { not_answered: ["appreciate"], parents: [{ name: "Dana Levi" }] }, wizard_step: 2 },
    ]);
  });

  it("sends the questionnaire from the heart step", async () => {
    const { bodies } = setup(parentProfile({ wizard: { step: 9, completed_at: null } }), () =>
      parentProfile({ questionnaire: { status: "submitted", submitted_at: "2026-10-06T08:00:00Z" }, wizard: { step: 10, completed_at: "2026-10-06T08:00:00Z" } }),
    );
    const { router } = renderApp({ routes, url: "/parent/children/c1/onboarding/9", user: parent, options });
    await screen.findByText(STEP_OF.en(9));
    fireEvent.change(within(question("PQ-HRT-01")!).getByRole("textbox"), { target: { value: "He is shy at first and then shines." } });
    fireEvent.click(screen.getByTestId("questionnaire-send"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/parent/children/c1/onboarding/10"));
    expect(await screen.findByText("Thank you!")).toBeTruthy();
    expect(screen.getByText("Already shared with the kindergarten")).toBeTruthy();
    expect(bodies).toEqual([
      { perspective: "parent", section: "heart", data: { message: "He is shy at first and then shines." }, wizard_step: 10, questionnaire: { submit: true } },
    ]);
  });

  it("resumes at the saved step", async () => {
    setup(parentProfile({ questionnaire: { status: "draft" }, wizard: { step: 4, completed_at: null } }));
    const { router } = renderApp({ routes, url: "/parent/children/c1/onboarding", user: parent, options });
    await waitFor(() => expect(router.state.location.pathname).toBe("/parent/children/c1/onboarding/4"));
  });
});

describe("the family's questionnaire (staff)", () => {
  it("records the meeting date and who came in meeting mode", async () => {
    const { bodies } = setup(staffProfile());
    const { router } = renderApp({ routes, url: "/children/c1/parent-view/answers/1?mode=meeting", user: teacher, options });
    await screen.findByText(STEP_OF.en(1));

    const card = screen.getByTestId("meeting-card");
    fireEvent.change(within(card).getByLabelText("Meeting date"), { target: { value: "2026-10-01" } });
    const who = within(card).getByRole("group", { name: "Who came" });
    fireEvent.click(within(who).getByRole("button", { name: /Mother/ }));
    fireEvent.click(within(who).getByRole("button", { name: /Father/ }));
    fireEvent.click(screen.getByTestId("questionnaire-next"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/children/c1/parent-view/answers/2"));
    expect(router.state.location.search).toBe("?mode=meeting");
    expect(bodies).toEqual([
      {
        perspective: "parent",
        questionnaire: { entry_mode: "meeting", meeting: { date: "2026-10-01", attendees: ["mother", "father"] } },
        wizard_step: 2,
      },
    ]);
  });

  it("enters the family's answers on their behalf", async () => {
    const { bodies } = setup(staffProfile({ wizard: { step: 1, completed_at: null } }));
    renderApp({ routes, url: "/children/c1/parent-view/answers/9?mode=on_behalf", user: teacher, options });
    await screen.findByText(STEP_OF.en(9));
    expect(await screen.findByText(/entering the answers of Adam's family/)).toBeTruthy();
    expect(screen.queryByTestId("meeting-card")).toBeNull();
    fireEvent.change(within(question("PQ-HRT-01")!).getByRole("textbox"), { target: { value: "Loves the garden." } });
    fireEvent.click(screen.getByTestId("questionnaire-send"));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      perspective: "parent",
      section: "heart",
      data: { message: "Loves the garden." },
      wizard_step: 10,
      questionnaire: { entry_mode: "on_behalf", submit: true },
    });
  });
});

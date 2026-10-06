import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QProfile } from "@/features/wizard/questionnaire";
import type { AppLocale } from "@/i18n/config";
import { normalizeOptions } from "@/lib/options";
import { clearSourceModelCache, primeSourceModel } from "@/lib/sourceModel";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";
import { routes } from "./routes";

/** WP2-PQ: the Teacher Quick Baseline (the teacher's part after reading the family's answers; one screen). */

const DATA = resolve(process.cwd(), "../backend/app/data");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const registry = read(`${DATA}/source/parent_questionnaire.json`);
const rawOptions = read(`${DATA}/options.json`);
const fragments = readdirSync(`${DATA}/lists`)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => read(`${DATA}/lists/${f}`).lists as Record<string, unknown>);
const options = normalizeOptions({ lists: Object.assign({}, ...fragments, rawOptions.lists) });
const label = (id: string, locale: AppLocale = "en") => (registry.items as { id: string; label: Record<AppLocale, string> }[]).find((i) => i.id === id)!.label[locale];

const HEART = "She sings to herself when she is calm.";

function profile(bridge: Record<string, unknown> = {}, status?: string): QProfile {
  return {
    child_id: "c1",
    perspective: "teacher",
    parent_perspective: {
      sections: {
        who: { describe_words: [{ key: "curious" }], appreciate: "Her laugh", strengths: [{ key: "imagination" }] },
        heart: { message: HEART },
      },
      entered: {},
    },
    teacher_perspective: { sections: { bridge }, entered: {} },
    questionnaire: { status: "submitted" },
    section_status: { parent: {}, teacher: status ? { bridge: { status } } : {} },
    strengths: [],
    interests: [],
    what_helps: [],
    wizard: { step: 1, completed_at: null },
    has_baseline: false,
  };
}

const child = { child: { id: "c1", name: "Lea Cohen", preferred_name: null, birth_date: "2022-03-01", gender: "girl", main_language: "he", additional_languages: [], parent_name: null, parent_contact: null } };

beforeEach(() => {
  clearSourceModelCache();
  primeSourceModel({ parent_questionnaire: registry, observation_model: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("Quick baseline", () => {
  it.each(["en", "he", "ar"] as AppLocale[])("renders the family summary and the 6 teacher questions in %s", async (locale) => {
    mockFetch({ "GET /api/children/c1/profile": { body: profile() }, "GET /api/children/c1": { body: child } });
    renderApp({ routes, url: "/children/c1/quick-baseline", user: { ...teacher, language: locale }, locale, options });
    const summary = await screen.findByTestId("family-summary");
    expect(within(summary).getByText(HEART)).toBeTruthy();
    expect(within(summary).getByText("Her laugh")).toBeTruthy();
    const form = screen.getByTestId("quick-baseline-form");
    for (const id of ["PQ-TCH-02", "PQ-TCH-03", "PQ-TCH-04", "PQ-TCH-05", "PQ-TCH-06", "PQ-TCH-07"]) expect(within(form).getByText(label(id, locale))).toBeTruthy();
    expect(document.documentElement.dir).toBe(locale === "en" ? "ltr" : "rtl");
  });

  it("needs exactly 3 main strengths before it can be marked as enough, then offers Create baseline", async () => {
    const bodies: Record<string, unknown>[] = [];
    let posted = 0;
    mockFetch({
      "GET /api/children/c1/profile": { body: profile() },
      "GET /api/children/c1": { body: child },
      "PATCH /api/children/c1/profile": (init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        bodies.push(body);
        return { body: profile(body.data as Record<string, unknown>, body.status as string) };
      },
      "POST /api/children/c1/baseline": () => {
        posted += 1;
        return { status: 201, body: { id: "b1" } };
      },
    });
    const { router } = renderApp({ routes, url: "/children/c1/quick-baseline", user: teacher, options });
    const form = await screen.findByTestId("quick-baseline-form");

    // The family's strength comes first as a suggestion.
    fireEvent.click(within(form).getByRole("button", { name: /Imagination/ }));
    fireEvent.click(within(form).getByRole("button", { name: /Curiosity/ }));
    fireEvent.click(within(form).getByRole("radio", { name: "Enough for now" }));
    expect(within(form).getByText(/Choose exactly 3 main strengths/)).toBeTruthy();
    expect((screen.getByTestId("qb-save") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(form).getByRole("button", { name: /Creativity/ }));
    // A 4th cannot be added.
    expect((within(form).getByRole("button", { name: /Good memory/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByRole("textbox", { name: "Thing to remember 1" }), { target: { value: "Likes a quiet corner" } });
    fireEvent.click(screen.getByTestId("qb-save"));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      perspective: "teacher",
      section: "bridge",
      status: "sufficient",
      data: {
        main_strengths: [{ key: "imagination" }, { key: "curiosity" }, { key: "creativity" }],
        remember: [{ text: "Likes a quiet corner" }],
      },
    });

    fireEvent.click(await screen.findByTestId("qb-create-baseline"));
    await waitFor(() => expect(posted).toBe(1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/children/c1"));
  });

  it("is staff only", async () => {
    mockFetch({ "GET /api/children/c1/profile": { body: profile() }, "GET /api/children/c1": { body: child } });
    renderApp({ routes, url: "/children/c1/quick-baseline", user: parent, options });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("quick-baseline-form")).toBeNull();
  });
});

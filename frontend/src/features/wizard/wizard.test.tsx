import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OptionLists } from "@/lib/options";
import { renderApp, teacher, mockFetch } from "@/test/utils";
import type { ProfileResponse } from "./api";
import { routes } from "./routes";

const opt = (key: string, en: string, extra: Record<string, string> = {}) => ({ key, label: { en, ar: `ع ${en}`, he: `ע ${en}` }, ...extra });

const options: OptionLists = {
  strengths: [opt("imagination", "Imagination"), opt("building", "Building")],
  interests: [opt("animals", "Animals")],
  describe_words: [opt("curious", "Curious")],
  motivators: [opt("praise", "Praise")],
  social: [opt("initiates_play", "Initiates play"), opt("joins_existing_play", "Joins existing play")],
  communication: [opt("asks_questions", "Asks questions")],
  priority_categories: [opt("social", "Social"), opt("emotional", "Emotional")],
  focus_suggestions: [opt("joining_group_play", "Joining group play", { category: "social" })],
  hope_child_feels: [opt("happy", "Happy")],
  support_levels: [opt("independent", "Independent"), opt("some_support", "Needs some support")],
  independence_areas: [opt("eating", "Eating")],
};

function profile(over: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    child_id: "c1",
    perspective: "teacher",
    parent_perspective: { sections: {}, entered: {} },
    teacher_perspective: { sections: {}, entered: {} },
    strengths: [],
    interests: [],
    motivators: [],
    what_helps: [],
    sensitivities: [],
    wizard: { step: 4, completed_at: null },
    has_baseline: false,
    ...over,
  };
}

const child = { child: { id: "c1", name: "Adam Haddad", preferred_name: null, birth_date: "2022-08-05", gender: "boy", main_language: "ar", additional_languages: [], parent_name: null, parent_contact: null } };

afterEach(() => vi.unstubAllGlobals());

describe("staff wizard", () => {
  it("saves the teacher's answers on Next and moves to the next step", async () => {
    const bodies: unknown[] = [];
    mockFetch({
      "GET /api/children/c1/profile": { body: profile() },
      "GET /api/children/c1": { body: child },
      "PATCH /api/children/c1/profile": (init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return { body: profile({ wizard: { step: 5, completed_at: null } }) };
      },
    });
    const { router } = renderApp({ routes, url: "/children/c1/edit/4", user: teacher, options });

    expect(await screen.findByRole("heading", { name: /playing and talking/i })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Parent says" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /initiates play/i }));
    fireEvent.click(screen.getByTestId("wizard-next"));

    await waitFor(() => expect(router.state.location.pathname).toBe("/children/c1/edit/5"));
    expect(bodies).toEqual([{ perspective: "teacher", section: "social", data: { social: ["initiates_play"] }, wizard_step: 5 }]);
  });

  it("points staff to the family's questionnaire (on behalf or in a meeting) instead of a per-step toggle", async () => {
    mockFetch({
      "GET /api/children/c1/profile": { body: profile() },
      "GET /api/children/c1": { body: child },
    });
    renderApp({ routes, url: "/children/c1/edit/4", user: teacher, options });
    const note = await screen.findByTestId("family-answers-note");
    expect(within(note).getByRole("link", { name: "Enter the family's answers" }).getAttribute("href")).toBe("/children/c1/parent-view/answers/1?mode=on_behalf");
    expect(within(note).getByRole("link", { name: "Fill in together with the family" }).getAttribute("href")).toBe("/children/c1/parent-view/answers/1?mode=meeting");
  });

  it("resumes at the saved step", async () => {
    mockFetch({
      "GET /api/children/c1/profile": { body: profile({ wizard: { step: 4, completed_at: null } }) },
      "GET /api/children/c1": { body: child },
    });
    const { router } = renderApp({ routes, url: "/children/c1/edit/continue", user: teacher, options });
    await waitFor(() => expect(router.state.location.pathname).toBe("/children/c1/edit/4"));
  });

  it("step 7 shows the Current Focus picker for the teacher view", async () => {
    mockFetch({
      "GET /api/children/c1/profile": { body: profile() },
      "GET /api/children/c1": { body: child },
      "GET /api/children/c1/focus-areas": { body: { focus_areas: [], max_active: 3 } },
    });
    renderApp({ routes, url: "/children/c1/edit/7", user: teacher, options });
    expect(await screen.findByRole("button", { name: /joining group play/i })).toBeTruthy();
    expect(screen.getByText("0 of 3")).toBeTruthy();
  });
});


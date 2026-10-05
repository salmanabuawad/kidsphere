import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChildStaffView } from "@/features/children";
import { PLAYER_FIXTURES } from "@/features/player/fixtures";
import { routes as parentRoutes } from "@/features/parent/routes";
import type { OptionLists } from "@/lib/options";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";
import type { ContentDetail, ContentSummary } from "./api";
import { routes } from "./routes";

const L = (en: string, ar: string, he: string) => ({ en, ar, he });
const options: OptionLists = {
  strengths: [
    { key: "building", icon: "🧱", label: L("Building", "البناء", "בנייה") },
    { key: "imagination", icon: "🌈", label: L("Imagination", "الخيال", "דמיון") },
  ],
  strength_targets: [
    { key: "storytelling", icon: "📖", label: L("Storytelling", "رواية القصص", "סיפור סיפורים") },
    { key: "building", icon: "🧱", label: L("Building", "البناء والتركيب", "בנייה והרכבה") },
  ],
  what_helps: [
    { key: "adult_mediation", icon: "🧑‍🏫", label: L("Adult guidance", "توجيه من شخص بالغ", "תיווך של מבוגר") },
    { key: "other", label: L("Other", "أخرى", "אחר") },
  ],
};

const adam: ChildStaffView = {
  id: "c1",
  view: "staff",
  name: "Adam",
  preferred_name: null,
  birth_date: "2022-08-05",
  age: { years: 4, months: 2 },
  gender: "boy",
  class: { id: "k", name: "Class A", kindergarten: "Sunflower KG" },
  main_language: "en",
  additional_languages: [],
  parent_name: null,
  parent_contact: null,
  has_photo: false,
  archived: false,
  updated_at: "2026-10-01T10:00:00Z",
  strengths: [{ key: "building", sources: ["teacher"] }, { custom: "Kind to animals" }],
  interests: [{ key: "cars_transportation", sources: ["parent"] }],
  what_helps: [],
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
      plan: { what_we_will_do: "Build the garage together" },
      created_at: "2026-09-01T10:00:00Z",
    },
  ],
  latest_observation: null,
  last_observation_at: null,
  wizard: { step: 8, completed_at: "2026-09-01T10:00:00Z" },
  baseline: { exists: true, latest_created_at: "2026-09-01T10:00:00Z" },
  draft_content_count: 1,
};

const en = PLAYER_FIXTURES.en;

function row(over: Partial<ContentDetail>): ContentDetail {
  return {
    id: "s1",
    child_id: "c1",
    pack_id: null,
    content_type: "story",
    template: null,
    language: "en",
    title: en.story.title,
    status: "draft",
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    approved_at: null,
    video_status: null,
    video_url: null,
    mode: "growth_support",
    focus_area_id: "f1",
    focus_area_title: "Joining group play",
    shared_with_parent: false,
    is_template: true,
    ai_provider: "template",
    ai_model: "kidsphere-template-1",
    variant: 0,
    last_feedback_result: null,
    content: en.story as unknown as Record<string, unknown>,
    generation_input: {
      mode: "growth_support",
      strengths: [{ key: "building", label: "Building" }],
      interests: [{ key: "cars_transportation", label: "Cars" }],
      focus: { title: "Joining group play" },
      variant: 0,
    },
    feedback: [],
    ...over,
  };
}

const NO_SCORES = /\d+\s*%|\bscore\b|\bpoints\b/i;

describe("ContentListPage", () => {
  it("groups content by status, keeps packs together and links to create", async () => {
    const list: ContentSummary[] = [
      row({ id: "d1", title: "Draft story" }),
      row({ id: "a1", title: "Garage time", content_type: "real_world_activity", status: "approved", shared_with_parent: true }),
      row({ id: "p-s", title: "Pack story", pack_id: "p1" }),
      row({ id: "p-g", title: "Pack game", content_type: "digital_game", pack_id: "p1" }),
      row({ id: "u1", title: "Used game", content_type: "digital_game", status: "completed", last_feedback_result: "partly" }),
      row({ id: "x1", title: "Old story", status: "archived" }),
    ];
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/content": { body: { content: list } },
    });
    renderApp({ routes, url: "/children/c1/content", user: teacher, options });

    const drafts = await screen.findByTestId("content-group-draft");
    expect(within(drafts).getByText("Draft story")).toBeTruthy();
    const pack = within(drafts).getByTestId("pack-group");
    expect(within(pack).getAllByTestId("content-row").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Pack story"),
      expect.stringContaining("Pack game"),
    ]);
    expect(within(pack).getByRole("link", { name: /Open pack/ }).getAttribute("href")).toBe("/packs/p1");

    const ready = screen.getByTestId("content-group-approved");
    expect(within(ready).getByText("Garage time")).toBeTruthy();
    expect(within(ready).getByText("Shared with parents")).toBeTruthy();
    expect(within(ready).getByRole("link", { name: /Present: Garage time/ }).getAttribute("href")).toBe("/content/a1/present");
    expect(within(screen.getByTestId("content-group-completed")).getByText("Partly")).toBeTruthy();
    expect(within(drafts).queryByRole("link", { name: /Present/ })).toBeNull();

    expect(screen.queryByText("Old story")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show archived" }));
    expect(within(screen.getByTestId("content-group-archived")).getByText("Old story")).toBeTruthy();

    expect(screen.getAllByRole("link", { name: /Create content/ })[0]!.getAttribute("href")).toBe("/children/c1/content/new");
    expect(document.body.textContent).not.toMatch(NO_SCORES);
  });

  it("has a friendly empty state", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: adam } }, "GET /api/children/c1/content": { body: { content: [] } } });
    renderApp({ routes, url: "/children/c1/content", user: teacher, options });
    expect(await screen.findByText("No content yet")).toBeTruthy();
  });
});

describe("CreateContentPage", () => {
  it("growth support: the focus from the link, a type, then a draft to review", async () => {
    let body: unknown = null;
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "POST /api/children/c1/content/generate": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { content: row({ id: "new1", title: "Build the Garage Together", content_type: "real_world_activity", content: en.activity as unknown as Record<string, unknown> }) } };
      },
      "GET /api/content/new1": {
        body: { content: row({ id: "new1", title: "Build the Garage Together", content_type: "real_world_activity", content: en.activity as unknown as Record<string, unknown> }) },
      },
    });
    renderApp({ routes, url: "/children/c1/content/new?mode=growth_support&focus=f1", user: teacher, options });

    expect(await screen.findByText("Create content for Adam")).toBeTruthy();
    expect(screen.getByTestId("mode-growth_support").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("focus-choice").getAttribute("aria-pressed")).toBe("true");
    const generate = screen.getByRole("button", { name: "Create draft" });
    expect(generate.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Choose what to create.")).toBeTruthy();

    fireEvent.click(screen.getByTestId("type-real_world_activity"));
    expect(screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Build the Garage Together" })).toBeTruthy();
    expect(body).toEqual({ mode: "growth_support", content_type: "real_world_activity", language: "en", focus_area_id: "f1" });
    expect(screen.getByTestId("template-badge").textContent).toBe("Made with templates");
  });

  it("strength builder: pick a strength and a small pack with a video plan", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "POST /api/children/c1/content/generate": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { items: [row({ id: "ps", pack_id: "p9" })], pack_id: "p9" } };
      },
      "GET /api/packs/p9": { body: { pack_id: "p9", child_id: "c1", items: [row({ id: "ps", pack_id: "p9" })] } },
    });
    renderApp({ routes, url: "/children/c1/content/new", user: teacher, options });

    fireEvent.click(await screen.findByTestId("mode-strength_builder"));
    // the child's own strength plus the generic targets (without duplicates)
    expect(screen.getAllByRole("radio", { name: /Building/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("radio", { name: /Storytelling/ }));
    fireEvent.click(screen.getByTestId("type-pack"));
    const video = screen.getByRole("checkbox", { name: "Include a video plan" }) as HTMLInputElement;
    expect(video.checked).toBe(false);
    fireEvent.click(video);
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Small pack" })).toBeTruthy();
    expect(body).toEqual({ mode: "strength_builder", content_type: "pack", language: "en", target_strength: "storytelling", include_video: true });
  });

  it("offers the game types and explains when there is no active focus", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: { ...adam, focus_areas: [] } } } });
    renderApp({ routes, url: "/children/c1/content/new", user: teacher, options });
    fireEvent.click(await screen.findByTestId("mode-growth_support"));
    expect(screen.getByText("There is no active focus area yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to focus areas" }).getAttribute("href")).toBe("/children/c1/focus");
    fireEvent.click(screen.getByTestId("type-digital_game"));
    expect(screen.getByRole("radio", { name: "Build a story" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Choose for me" }).getAttribute("aria-checked")).toBe("true");
  });

  it("is RTL in Arabic", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: adam } } });
    renderApp({ routes, url: "/children/c1/content/new", user: { ...teacher, language: "ar" }, options, locale: "ar" });
    expect(await screen.findByText("ما الهدف؟")).toBeTruthy();
    expect(document.documentElement.dir).toBe("rtl");
  });
});

describe("ContentReviewPage", () => {
  it("a draft can be approved; Present appears only once it is approved", async () => {
    mockFetch({
      "GET /api/content/s1": { body: { content: row({}) } },
      "GET /api/children/c1": { body: { child: adam } },
      "POST /api/content/s1/approve": { body: { content: row({ status: "approved", approved_at: "2026-10-02T10:00:00Z" }), video_job: null } },
    });
    renderApp({ routes, url: "/content/s1", user: teacher, options });

    expect(await screen.findByTestId("story-player")).toBeTruthy();
    expect(screen.getByTestId("content-status").textContent).toBe("Draft");
    expect(screen.queryByRole("link", { name: /Present/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "How did it go?" })).toBeNull();
    expect(screen.getByRole("button", { name: "Share with parents" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("why-card").textContent).toContain("Joining group play");

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByTestId("content-status").textContent).toBe("Ready to use"));
    expect(screen.getByRole("link", { name: /Present/ }).getAttribute("href")).toBe("/content/s1/present");
  });

  it("feedback saves with two taps: a result, then Save", async () => {
    let body: unknown = null;
    const approved = row({ status: "approved" });
    mockFetch({
      "GET /api/content/s1": { body: { content: approved } },
      "POST /api/content/s1/feedback": (init) => {
        body = JSON.parse(String(init?.body));
        return {
          status: 201,
          body: {
            feedback: { id: "fb1", result: "partly", support_level: null, observation: null, what_helped: null, created_at: "2026-10-02T10:00:00Z", by_name: "Rana" },
            content: { ...approved, status: "completed", feedback: [{ id: "fb1", result: "partly", support_level: null, observation: null, what_helped: null, created_at: "2026-10-02T10:00:00Z", by_name: "Rana" }] },
          },
        };
      },
    });
    renderApp({ routes, url: "/content/s1", user: teacher, options });

    fireEvent.click(await screen.findByRole("button", { name: "How did it go?" }));
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Partly/ })); // tap 1
    fireEvent.click(save); // tap 2
    expect(await screen.findByText("Thank you! It was added to the timeline.")).toBeTruthy();
    expect(body).toEqual({ result: "partly", client_request_id: expect.any(String) });
    await waitFor(() => expect(screen.getByTestId("content-status").textContent).toBe("Used"));
    expect(within(screen.getByTestId("feedback-history")).getByText("Partly")).toBeTruthy();
  });

  it("feedback resends one request id on a retry and takes a new one after a successful save", async () => {
    const ids: string[] = [];
    let fail = true;
    const approved = row({ status: "approved" });
    const fb = { id: "fb1", result: "partly", support_level: null, observation: null, what_helped: null, created_at: "2026-10-02T10:00:00Z", by_name: "Rana" };
    mockFetch({
      "GET /api/content/s1": { body: { content: approved } },
      "POST /api/content/s1/feedback": (init) => {
        ids.push(JSON.parse(String(init?.body)).client_request_id);
        if (fail) {
          fail = false;
          return { status: 500, body: { error: { code: "INTERNAL", message: "x" } } };
        }
        return { status: 201, body: { feedback: fb, content: { ...approved, status: "completed", feedback: [fb] } } };
      },
    });
    renderApp({ routes, url: "/content/s1", user: teacher, options });

    fireEvent.click(await screen.findByRole("button", { name: "How did it go?" }));
    fireEvent.click(screen.getByRole("radio", { name: /Partly/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(ids).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save" })); // the retry
    expect(await screen.findByText("Thank you! It was added to the timeline.")).toBeTruthy();
    expect(ids).toHaveLength(2);
    expect(typeof ids[0]).toBe("string");
    expect(ids[0].length).toBeGreaterThan(0);
    expect(ids[1]).toBe(ids[0]);

    // After the save, the next feedback starts empty, with a new id.
    await waitFor(() => expect(screen.getByTestId("content-status").textContent).toBe("Used"));
    fireEvent.click(screen.getByRole("button", { name: "How did it go?" }));
    expect(screen.getByRole("radio", { name: /Partly/ }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("radio", { name: /Worked well/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(ids).toHaveLength(3));
    expect(ids[2]).not.toBe(ids[0]);
  });

  it("feedback keeps its request id and answers after an error, Cancel and reopening", async () => {
    // A lost response: the server may have saved it, so Save after reopening must not make a second feedback.
    const ids: string[] = [];
    let fail = true;
    const approved = row({ status: "approved" });
    const fb = { id: "fb1", result: "partly", support_level: null, observation: null, what_helped: null, created_at: "2026-10-02T10:00:00Z", by_name: "Rana" };
    mockFetch({
      "GET /api/content/s1": { body: { content: approved } },
      "POST /api/content/s1/feedback": (init) => {
        ids.push(JSON.parse(String(init?.body)).client_request_id);
        if (fail) {
          fail = false;
          return { status: 500, body: { error: { code: "INTERNAL", message: "x" } } };
        }
        return { status: 200, body: { feedback: fb, content: { ...approved, status: "completed", feedback: [fb] } } };
      },
    });
    renderApp({ routes, url: "/content/s1", user: teacher, options });

    fireEvent.click(await screen.findByRole("button", { name: "How did it go?" }));
    fireEvent.click(screen.getByRole("radio", { name: /Partly/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(ids).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Partly/ })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "How did it go?" }));
    expect(screen.getByRole("radio", { name: /Partly/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Thank you! It was added to the timeline.")).toBeTruthy();
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
  });

  it("leaving Present (?feedback=1) opens How did it go?", async () => {
    mockFetch({ "GET /api/content/s1": { body: { content: row({ status: "approved" }) } } });
    renderApp({ routes, url: "/content/s1?feedback=1", user: teacher, options });
    expect(await screen.findByRole("radio", { name: /Worked well/ })).toBeTruthy();
  });

  it("shows wording problems from the server when saving an edit", async () => {
    mockFetch({
      "GET /api/content/s1": { body: { content: row({}) } },
      "PUT /api/content/s1": {
        status: 422,
        body: { error: { code: "UNSAFE_CONTENT", message: "x", details: { issues: ['story: uses the clinical term "x-term"'] } } },
      },
    });
    renderApp({ routes, url: "/content/s1", user: teacher, options });
    fireEvent.click(await screen.findByRole("tab", { name: /Edit/ }));
    const editor = screen.getByTestId("content-editor");
    fireEvent.change(within(editor).getByLabelText("Title"), { target: { value: "A new title" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Some wording needs to change")).toBeTruthy();
    expect(screen.getByTestId("unsafe-issues").textContent).toContain("x-term");
  });

  it("completed content cannot be edited but can be duplicated", async () => {
    mockFetch({
      "GET /api/content/u1": { body: { content: row({ id: "u1", status: "completed" }) } },
      "POST /api/content/u1/duplicate": { status: 201, body: { content: row({ id: "dup1", title: "Copy of the story" }) } },
      "GET /api/content/dup1": { body: { content: row({ id: "dup1", title: "Copy of the story" }) } },
    });
    renderApp({ routes, url: "/content/u1", user: teacher, options });
    expect(await screen.findByText("This content was used. To change it, duplicate it as a new draft.")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "New version" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate as new draft" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Copy of the story" })).toBeTruthy();
  });
});

describe("PresentPage", () => {
  it("is not available for drafts", async () => {
    mockFetch({ "GET /api/content/s1": { body: { content: row({}) } } });
    renderApp({ routes, url: "/content/s1/present", user: teacher, options });
    expect(await screen.findByText("Approve this content before presenting it.")).toBeTruthy();
    expect(screen.queryByTestId("present-frame")).toBeNull();
  });

  it("shows approved content full screen with the player, in the content language", async () => {
    const he = PLAYER_FIXTURES.he;
    mockFetch({ "GET /api/content/s1": { body: { content: row({ status: "approved", language: "he", title: he.story.title, content: he.story as unknown as Record<string, unknown> }) } } });
    renderApp({ routes, url: "/content/s1/present", user: teacher, options });
    const frame = await screen.findByTestId("present-frame");
    expect(frame.getAttribute("dir")).toBe("rtl");
    expect(within(frame).getByTestId("story-player")).toBeTruthy();
  });
});

describe("Parent content pages", () => {
  it("parents see the shared story without the teacher note", async () => {
    const shared = { ...row({ status: "approved" }), content: { ...en.story, teacher_note: undefined } };
    delete (shared as Record<string, unknown>).generation_input;
    mockFetch({ "GET /api/content/s1": { body: { content: shared } } });
    renderApp({ routes: parentRoutes, url: "/parent/content/s1", user: parent, options });
    expect(await screen.findByTestId("story-player")).toBeTruthy();
    expect(document.body.textContent).not.toContain(en.story.teacher_note);
    expect(screen.getByRole("button", { name: "Full screen" })).toBeTruthy();
  });

  it("lists what was shared, in Arabic (RTL)", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: { ...adam, view: "parent" } } },
      "GET /api/children/c1/content": { body: { content: [row({ id: "s1", status: "approved" })] } },
    });
    renderApp({ routes: parentRoutes, url: "/parent/children/c1/content", user: { ...parent, language: "ar" }, options, locale: "ar" });
    expect(await screen.findByText("أنشطة لـAdam")).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(en.story.title) }).getAttribute("href")).toBe("/parent/content/s1");
    expect(document.documentElement.dir).toBe("rtl");
  });
});

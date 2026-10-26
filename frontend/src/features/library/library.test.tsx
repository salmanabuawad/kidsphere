import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { routes as contentRoutes } from "@/features/content/routes";
import type { User } from "@/auth/AuthProvider";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";
import { routes as libraryRoutes } from "./routes";

const routes = [...libraryRoutes, ...contentRoutes];
const admin = { ...teacher, id: "u-admin", name: "Admin", role: "admin" } as User;

const storyContent = {
  title: "لولو والغيمة الصغيرة",
  goal: "التنفّس الهادئ.",
  story: ["كان يا ما كان، عاش أرنب صغير اسمه لولو.", "وهكذا تعلّم لولو أن يتنفّس بهدوء."],
  questions: ["ماذا فعل لولو ليهدأ؟", "من تطلب منه المساعدة؟"],
  teacher_note: "نتنفّس مع الأطفال.",
};
const story = {
  id: "i1",
  collection_id: "k1",
  content_type: "story",
  template: null,
  language: "ar",
  title: "لولو والغيمة الصغيرة",
  goal: "التنفّس الهادئ.",
  hero: "لولو",
  audience: "child",
  mode: "strength_builder",
  target_strength: "confidence",
  goals: [{ key: "sharing_toys" }, { custom: "Breathing calmly" }],
  suits: [{ list: "describe_words", key: "shy_at_first" }],
  sort_order: 0,
  status: "published",
  updated_at: "2026-10-27T10:00:00Z",
};
const activity = { ...story, id: "i2", content_type: "real_world_activity", title: "نشمّ الزهرة ونطفئ الشمعة", audience: "group" };
const collection = (over: Record<string, unknown> = {}) => ({
  id: "k1", title: "لولو والغيمة الصغيرة", description: null, ages: "من عمر ثلاث سنوات", sort_order: 0, status: "published",
  updated_at: null, items: [story, activity], ...over,
});
const media = [
  { id: "m1", slot: "page:0", kind: "image", mime: "image/jpeg", url: "/api/library/media/m1", alt: "Lulu under a tree", credit: null },
  { id: "m2", slot: "narration:0", kind: "audio", mime: "audio/mpeg", url: "/api/library/media/m2", alt: null, credit: null },
  { id: "m3", slot: "music", kind: "audio", mime: "audio/mpeg", url: "/api/library/media/m3", alt: null, credit: "Our own" },
];
const slots = ["cover", "page:0", "page:1", "narration:0", "narration:1", "music"];
const detail = { ...story, content: storyContent, media, media_slots: slots };
const L = (en: string) => ({ en, ar: en, he: en });
const options = {
  focus_suggestions: [{ key: "sharing_toys", label: L("Sharing toys") }, { key: "taking_turns", label: L("Taking turns") }],
  describe_words: [{ key: "shy_at_first", label: L("Shy at first") }],
  social: [{ key: "needs_adult_support_to_join", label: L("Joins in with adult support") }],
  communication: [],
  frustration_reactions: [],
  transition_reactions: [],
  morning_separation: [],
  strength_targets: [{ key: "confidence", label: L("Confidence") }],
};
const card = (id: string, name: string) => ({
  id, name, preferred_name: null, birth_date: "2021-01-01", age: { years: 4, months: 0 },
  class: { id: "c", name: "Butterflies", kindergarten: "Sunflower" }, main_language: "ar", has_photo: false, updated_at: null,
});

describe("Content library (teachers)", () => {
  it("lists the published items by collection, with who they are for", async () => {
    mockFetch({ "GET /api/library": { body: { collections: [collection(), collection({ id: "k2", title: "لولو والسرّ السحري", ages: null, items: [{ ...story, id: "i3", collection_id: "k2" }] })] } } });
    renderApp({ routes, url: "/library", user: teacher, options });
    expect(await screen.findByRole("heading", { level: 1, name: "Content library" })).toBeTruthy();
    expect(screen.getAllByTestId("library-collection")).toHaveLength(2);
    expect(screen.getAllByTestId("library-row")).toHaveLength(3);
    expect(screen.getByText("Real-world activity · For a group")).toBeTruthy();
  });

  it("gives an item to children, with their names by default", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/library/items/i1": { body: { item: detail } },
      "GET /api/children": { body: { children: [card("c1", "Adam"), card("c2", "Maya")], classes: [] } },
      "POST /api/library/items/i1/assign": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { content: [{ id: "n1", child_id: "c1", title: "x" }, { id: "n2", child_id: "c2", title: "y" }] } };
      },
    });
    renderApp({ routes, url: "/library/i1", user: teacher, options });
    expect(await screen.findByText(/عاش أرنب صغير اسمه لولو/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Give to children" }));
    const useName = (await screen.findByRole("checkbox", { name: "Use each child's name instead of “لولو”" })) as HTMLInputElement;
    expect(useName.checked).toBe(true);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Adam/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Maya/ }));
    fireEvent.click(screen.getByRole("button", { name: "Give to 2 children" }));
    expect(await screen.findByText("New drafts were created for 2 children.")).toBeTruthy();
    expect(body).toEqual({ child_ids: ["c1", "c2"], use_child_name: true });
  });

  it("can keep the character's name, and opens the draft for one child", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/library/items/i1": { body: { item: detail } },
      "GET /api/children": { body: { children: [card("c1", "Adam")], classes: [] } },
      "POST /api/library/items/i1/assign": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { content: [{ id: "n1", child_id: "c1", title: "لولو والغيمة الصغيرة" }] } };
      },
      "GET /api/content/n1": {
        body: { content: { id: "n1", child_id: "c1", content_type: "story", language: "ar", title: "لولو والغيمة الصغيرة", status: "draft", content: storyContent } },
      },
    });
    renderApp({ routes, url: "/library/i1", user: teacher, options });
    fireEvent.click(await screen.findByRole("button", { name: "Give to children" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /instead of/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Adam/ }));
    fireEvent.click(screen.getByRole("button", { name: "Give to 1 child" }));
    expect(await screen.findByText(/This is a draft\. Check it/)).toBeTruthy();
    expect(body).toEqual({ child_ids: ["c1"], use_child_name: false });
  });

  it("is not offered to parents", async () => {
    mockFetch({ "GET /api/library": { body: { collections: [] } } });
    renderApp({ routes, url: "/library", user: parent });
    expect(screen.queryByRole("heading", { level: 1, name: "Content library" })).toBeNull();
  });
});

describe("Manage library (admins)", () => {
  it("shows every collection and item with its status, and creates a collection", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/admin/library": { body: { collections: [collection({ items: [story, { ...activity, status: "draft" }] })] } },
      "POST /api/admin/library/collections": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { collection: collection({ id: "k9", title: "New set", items: [] }) } };
      },
    });
    renderApp({ routes, url: "/admin/library", user: admin, options });
    const col = await screen.findByTestId("admin-collection");
    expect(within(col).getAllByTestId("admin-item")).toHaveLength(2);
    expect(within(col).getByText("Draft")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New collection" }));
    fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: "New set" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(body).toEqual({ title: "New set", ages: null, description: null });
  });

  it("publishes an item and saves its details", async () => {
    const bodies: Record<string, unknown>[] = [];
    mockFetch({
      "GET /api/admin/library": { body: { collections: [collection()] } },
      "GET /api/library/items/i1": { body: { item: { ...detail, status: "draft" } } },
      "PUT /api/admin/library/items/i1": (init) => {
        const b = JSON.parse(String(init?.body));
        bodies.push(b);
        return { body: { item: { ...detail, status: b.status ?? "draft", hero: b.hero ?? detail.hero } } };
      },
    });
    renderApp({ routes, url: "/admin/library/items/i1", user: admin, options });
    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Published. Teachers can now give it to children.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Unpublish" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Character name/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(bodies[0]).toEqual({ status: "published" });
    expect(bodies[1]).toMatchObject({ collection_id: "k1", language: "ar", hero: null, audience: "child", target_strength: "confidence" });
  });

  it("creates a new item from the editor", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/admin/library": { body: { collections: [collection()] } },
      "POST /api/admin/library/items": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { item: { ...detail, id: "i9", status: "draft" } } };
      },
      "GET /api/library/items/i9": { body: { item: { ...detail, id: "i9", status: "draft" } } },
    });
    renderApp({ routes, url: "/admin/library/items/new?collection=k1", user: admin, options });
    expect(await screen.findByTestId("content-editor")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Sami" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    // The editor checks the shape first: an empty story is not saved.
    expect(body).toBeNull();
  });

  it("is admin only", async () => {
    mockFetch({ "GET /api/admin/library": { body: { collections: [] } } });
    renderApp({ routes, url: "/admin/library", user: teacher });
    expect(screen.queryByRole("heading", { level: 1, name: "Manage library" })).toBeNull();
  });
});

describe("Library media and tags", () => {
  it("shows what an item builds and who it suits, its picture, music and recorded narration", async () => {
    const played: string[] = [];
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      played.push(this.src);
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    mockFetch({ "GET /api/library/items/i1": { body: { item: detail } } });
    renderApp({ routes, url: "/library/i1", user: teacher, options });
    const tags = await screen.findByTestId("item-tags");
    expect(within(tags).getByText("Sharing toys")).toBeTruthy();
    expect(within(tags).getByText("Breathing calmly")).toBeTruthy();
    expect(within(tags).getByText("Shy at first")).toBeTruthy();
    const picture = screen.getByTestId("story-picture") as HTMLImageElement;
    expect(picture.getAttribute("src")).toBe("/api/library/media/m1");
    expect(picture.alt).toBe("Lulu under a tree");
    fireEvent.click(screen.getByTestId("story-listen"));
    expect(played.at(-1)).toContain("/api/library/media/m2");
    fireEvent.click(screen.getByTestId("music-toggle"));
    expect(played.at(-1)).toContain("/api/library/media/m3");
    expect(screen.getByTestId("music-toggle").getAttribute("aria-pressed")).toBe("true");
    // Page 2 has no picture or narration: the emoji, and the browser voice if there is one.
    fireEvent.click(screen.getByTestId("story-next"));
    expect(screen.queryByTestId("story-picture")).toBeNull();
    play.mockRestore();
  });

  it("lets an admin upload media per slot and pick goals", async () => {
    let uploaded: FormData | null = null;
    const bodies: Record<string, unknown>[] = [];
    mockFetch({
      "GET /api/admin/library": { body: { collections: [collection()] } },
      "GET /api/library/items/i1": { body: { item: { ...detail, media: [] } } },
      "PUT /api/admin/library/items/i1/media/page%3A1": (init) => {
        uploaded = init?.body as FormData;
        return { body: { media: [{ id: "m9", slot: "page:1", kind: "image", mime: "image/jpeg", url: "/api/library/media/m9", alt: null, credit: null }] } };
      },
      "PUT /api/admin/library/items/i1": (init) => {
        const b = JSON.parse(String(init?.body));
        bodies.push(b);
        return { body: { item: { ...detail, ...b } } };
      },
    });
    renderApp({ routes, url: "/admin/library/items/i1", user: admin, options });
    fireEvent.click(await screen.findByRole("tab", { name: "Media" }));
    const slot = await screen.findByTestId("media-slot-page:1");
    expect(within(slot).getByText("Page 2: picture")).toBeTruthy();
    const file = new File(["x"], "lulu.png", { type: "image/png" });
    fireEvent.change(within(slot).getByLabelText("Page 2: picture: Upload"), { target: { files: [file] } });
    expect(await screen.findByText("Uploaded.")).toBeTruthy();
    expect((uploaded as unknown as FormData).get("file")).toBeTruthy();
    expect(screen.getByTestId("media-slot-page:1").querySelector("img")?.getAttribute("src")).toBe("/api/library/media/m9");

    // Goals: add one from the list, then save the details.
    fireEvent.click(within(screen.getByTestId("goal-picker")).getByRole("button", { name: "Taking turns" }));
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(bodies[0]!.goals).toEqual([{ key: "sharing_toys" }, { custom: "Breathing calmly" }, { key: "taking_turns" }]);
  });
});

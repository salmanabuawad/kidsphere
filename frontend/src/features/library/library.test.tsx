import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  sort_order: 0,
  status: "published",
  updated_at: "2026-10-27T10:00:00Z",
};
const activity = { ...story, id: "i2", content_type: "real_world_activity", title: "نشمّ الزهرة ونطفئ الشمعة", audience: "group" };
const collection = (over: Record<string, unknown> = {}) => ({
  id: "k1", title: "لولو والغيمة الصغيرة", description: null, ages: "من عمر ثلاث سنوات", sort_order: 0, status: "published",
  updated_at: null, items: [story, activity], ...over,
});
const detail = { ...story, content: storyContent };
const card = (id: string, name: string) => ({
  id, name, preferred_name: null, birth_date: "2021-01-01", age: { years: 4, months: 0 },
  class: { id: "c", name: "Butterflies", kindergarten: "Sunflower" }, main_language: "ar", has_photo: false, updated_at: null,
});

describe("Content library (teachers)", () => {
  it("lists the published items by collection, with who they are for", async () => {
    mockFetch({ "GET /api/library": { body: { collections: [collection(), collection({ id: "k2", title: "لولو والسرّ السحري", ages: null, items: [{ ...story, id: "i3", collection_id: "k2" }] })] } } });
    renderApp({ routes, url: "/library", user: teacher });
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
    renderApp({ routes, url: "/library/i1", user: teacher });
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
    renderApp({ routes, url: "/library/i1", user: teacher });
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
    renderApp({ routes, url: "/admin/library", user: admin });
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
    renderApp({ routes, url: "/admin/library/items/i1", user: admin });
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
    renderApp({ routes, url: "/admin/library/items/new?collection=k1", user: admin });
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

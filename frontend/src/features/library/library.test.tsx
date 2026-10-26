import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routes as contentRoutes } from "@/features/content/routes";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";
import { routes as libraryRoutes } from "./routes";

const routes = [...libraryRoutes, ...contentRoutes];

const story = {
  key: "lulu_cloud_story",
  collection: "lulu_cloud",
  content_type: "story",
  template: null,
  language: "ar",
  title: "لولو والغيمة الصغيرة",
  goal: "التنفّس الهادئ.",
  hero: "لولو",
};
const listing = {
  collections: [
    { key: "lulu_cloud", title: "لولو والغيمة الصغيرة", ages: "من عمر ثلاث سنوات" },
    { key: "lulu_tower", title: "لولو والسرّ السحري", ages: null },
  ],
  items: [story, { ...story, key: "lulu_tower_story", collection: "lulu_tower", title: "لولو والسرّ السحري للقوة الداخلية" }],
};
const detail = {
  ...story,
  content: {
    title: story.title,
    goal: story.goal,
    story: ["كان يا ما كان، عاش أرنب صغير اسمه لولو.", "وهكذا تعلّم لولو أن يتنفّس بهدوء."],
    questions: ["ماذا فعل لولو ليهدأ؟", "من تطلب منه المساعدة؟"],
    teacher_note: "نتنفّس مع الأطفال.",
  },
};
const card = (id: string, name: string) => ({
  id, name, preferred_name: null, birth_date: "2021-01-01", age: { years: 4, months: 0 },
  class: { id: "k1", name: "Butterflies", kindergarten: "Sunflower" }, main_language: "ar", has_photo: false, updated_at: null,
});

describe("Content library", () => {
  it("lists the items by collection", async () => {
    mockFetch({ "GET /api/library": { body: listing } });
    renderApp({ routes, url: "/library", user: teacher });
    expect(await screen.findByRole("heading", { level: 1, name: "Content library" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "لولو والسرّ السحري" })).toBeTruthy();
    expect(screen.getAllByTestId("library-row")).toHaveLength(2);
    expect(screen.getByText("من عمر ثلاث سنوات")).toBeTruthy();
  });

  it("gives an item to children, with their names by default", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/library/lulu_cloud_story": { body: { item: detail } },
      "GET /api/children": { body: { children: [card("c1", "Adam"), card("c2", "Maya")], classes: [] } },
      "POST /api/library/lulu_cloud_story/assign": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { content: [{ id: "n1", child_id: "c1", title: "x" }, { id: "n2", child_id: "c2", title: "y" }] } };
      },
    });
    renderApp({ routes, url: "/library/lulu_cloud_story", user: teacher });
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
      "GET /api/library/lulu_cloud_story": { body: { item: detail } },
      "GET /api/children": { body: { children: [card("c1", "Adam")], classes: [] } },
      "POST /api/library/lulu_cloud_story/assign": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { content: [{ id: "n1", child_id: "c1", title: "لولو والغيمة الصغيرة" }] } };
      },
      "GET /api/content/n1": {
        body: { content: { id: "n1", child_id: "c1", content_type: "story", language: "ar", title: "لولو والغيمة الصغيرة", status: "draft", content: detail.content } },
      },
    });
    renderApp({ routes, url: "/library/lulu_cloud_story", user: teacher });
    fireEvent.click(await screen.findByRole("button", { name: "Give to children" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /instead of/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Adam/ }));
    fireEvent.click(screen.getByRole("button", { name: "Give to 1 child" }));
    // The new draft's review page.
    expect(await screen.findByText(/This is a draft\. Check it/)).toBeTruthy();
    expect(body).toEqual({ child_ids: ["c1"], use_child_name: false });
  });

  it("is not offered to parents", async () => {
    mockFetch({ "GET /api/library": { body: listing } });
    renderApp({ routes, url: "/library", user: parent });
    expect(screen.queryByRole("heading", { level: 1, name: "Content library" })).toBeNull();
  });
});

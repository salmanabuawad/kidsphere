import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routes as libraryRoutes } from "@/features/library/routes";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { routes as sessionRoutes } from "./routes";

const routes = [...libraryRoutes, ...sessionRoutes];
const klass = { id: "k1", name: "Butterflies", kindergarten: "Sunflower" };
const card = (id: string, name: string) => ({
  id, name, preferred_name: null, birth_date: "2021-01-01", age: { years: 4, months: 0 }, class: klass,
  main_language: "ar", has_photo: false, updated_at: null,
});
const item = {
  id: "i1", collection_id: "c1", content_type: "real_world_activity", template: null, language: "ar",
  title: "شجرة القوة الداخلية", goal: null, hero: null, audience: "group", mode: "strength_builder",
  target_strength: null, goals: [], suits: [], sort_order: 0, status: "published", updated_at: null,
  content: {
    title: "شجرة القوة الداخلية", goal: "التعرّف إلى المشاعر.", duration_minutes: 15, materials: [],
    instructions: ["نعرض الصور.", "نعلّق الأوراق."], what_to_observe: ["الكلمات."], adaptation: "نكتب نحن.",
  },
  media: [], media_slots: [],
};
const child = (id: string, name: string, observation: Record<string, unknown> | null = null) => ({
  id, name, preferred_name: null, has_photo: false, updated_at: null, observation,
});
const session = (children = [child("a", "Adam"), child("m", "Maya")]) => ({
  id: "s1", class: { id: "k1", name: "Butterflies" }, library_item: { id: "i1", title: item.title, content_type: item.content_type },
  title: item.title, held_on: "2026-10-27", children_count: children.length,
  noted_count: children.filter((c) => c.observation).length, created_by: null, created_at: null, children,
});

describe("Class sessions", () => {
  it("runs a library activity with a class", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/library/items/i1": { body: { item } },
      "GET /api/children": { body: { children: [card("a", "Adam"), card("m", "Maya"), card("o", "Omar")], classes: [klass] } },
      "POST /api/class-sessions": (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: { session: session() } };
      },
      "GET /api/class-sessions/s1": { body: { session: session() } },
    });
    renderApp({ routes, url: "/library/i1", user: teacher });
    fireEvent.click(await screen.findByRole("button", { name: "Run with a class" }));
    const omar = (await screen.findByRole("checkbox", { name: "Omar" })) as HTMLInputElement;
    expect(omar.checked).toBe(true);
    fireEvent.click(omar);
    fireEvent.click(screen.getByRole("button", { name: "Start with 2 children" }));
    expect(await screen.findByText(/Tap how it went for each child/)).toBeTruthy();
    expect(body).toMatchObject({ class_id: "k1", library_item_id: "i1", title: item.title, child_ids: ["a", "m"] });
  });

  it("notes how each child did and saves only what changed", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/class-sessions/s1": { body: { session: session([child("a", "Adam"), child("m", "Maya", { id: "o1", support_level: "independent", observation: null, focus_area_id: null, focus_area_title: null })]) } },
      "PUT /api/class-sessions/s1/observations": (init) => {
        body = JSON.parse(String(init?.body));
        return {
          body: {
            session: session([
              child("a", "Adam", { id: "o2", support_level: "some_support", observation: "Hung his leaf with a friend.", focus_area_id: "f1", focus_area_title: "Joining group play" }),
              child("m", "Maya", { id: "o1", support_level: "independent", observation: null, focus_area_id: null, focus_area_title: null }),
            ]),
          },
        };
      },
    });
    renderApp({ routes, url: "/sessions/s1", user: teacher });
    const rows = await screen.findAllByTestId("session-child");
    expect(within(rows[1]!).getByText("Noted")).toBeTruthy();
    expect((screen.getByRole("button", { name: /^Save/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(rows[0]!).getByRole("radio", { name: /With support|Needs some support/ }));
    fireEvent.change(screen.getByLabelText("Note about Adam"), { target: { value: "Hung his leaf with a friend." } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 note" }));
    expect(await screen.findByText("Saved. The notes are on the children's timelines.")).toBeTruthy();
    expect(body).toEqual({ entries: [{ child_id: "a", support_level: "some_support", observation: "Hung his leaf with a friend." }] });
    expect(await screen.findByText("Focus: Joining group play")).toBeTruthy();
  });

  it("lists the sessions", async () => {
    mockFetch({ "GET /api/class-sessions": { body: { sessions: [session()] } } });
    renderApp({ routes, url: "/sessions", user: teacher });
    const row = await screen.findByTestId("session-row");
    expect(within(row).getByText(/0 of 2 noted/)).toBeTruthy();
  });
});

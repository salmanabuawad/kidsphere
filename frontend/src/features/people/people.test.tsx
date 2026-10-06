import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChildStaffView } from "@/features/children";
import { routes as childRoutes } from "@/features/children/routes";
import { routes as parentRoutes } from "@/features/parent/routes";
import type { OptionLists } from "@/lib/options";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";
import type { Person } from "./api";

const L = (en: string, ar: string, he: string) => ({ en, ar, he });
const options: OptionLists = {
  person_relations: [
    { key: "grandfather", icon: "👴", label: L("Grandfather", "الجدّ", "סבא") },
    { key: "sister", icon: "👧", label: L("Sister", "الأخت", "אחות") },
    { key: "pet", icon: "🐾", label: L("Pet", "حيوان أليف", "חיית מחמד") },
  ],
};

const adam = {
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
  strengths: [],
  interests: [],
  what_helps: [],
  motivators: [],
  sensitivities: [],
  current_understanding: null,
  focus_areas: [],
  latest_observation: null,
  last_observation_at: null,
  wizard: { step: 8, completed_at: "2026-09-01T10:00:00Z" },
  baseline: { exists: true, latest_created_at: "2026-09-01T10:00:00Z" },
  draft_content_count: 0,
} as unknown as ChildStaffView;

const sido: Person = { id: "p1", child_id: "c1", relation: "grandfather", display_name: "Sido", has_photo: true, updated_at: "2026-10-02T10:00:00Z" };
const lulu: Person = { id: "p2", child_id: "c1", relation: "sister", display_name: "Lulu", has_photo: false, updated_at: "2026-10-02T10:00:00Z" };

describe("PeopleCard on the child Overview", () => {
  it("lists the people with their photo or relation icon, and adds a new one", async () => {
    let people: Person[] = [sido];
    let created: unknown = null;
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/people": () => ({ body: { people, max: 12 } }),
      "POST /api/children/c1/people": (init) => {
        created = JSON.parse(String(init?.body));
        people = [...people, lulu];
        return { status: 201, body: { person: lulu } };
      },
    });
    renderApp({ routes: childRoutes, url: "/children/c1", user: teacher, options });

    const card = await screen.findByTestId("people-card");
    expect(within(card).getByText("People in Adam's life")).toBeTruthy();
    const tile = await within(card).findByTestId("person-tile");
    expect(tile.textContent).toContain("Sido");
    expect(tile.textContent).toContain("Grandfather");
    expect(tile.querySelector("img")?.getAttribute("src")).toBe("/api/people/p1/photo?v=2026-10-02T10%3A00%3A00Z");
    expect(card.textContent).toContain("Names and photos stay in KidSphere");

    fireEvent.click(within(card).getByTestId("people-add"));
    const dialog = await screen.findByRole("dialog");
    // Both a relation and a name are needed.
    fireEvent.click(within(dialog).getByTestId("person-save"));
    expect(within(dialog).getByText("Choose who this person is to the child.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Sister/ }));
    fireEvent.change(within(dialog).getByTestId("person-name"), { target: { value: "  Lulu " } });
    fireEvent.click(within(dialog).getByTestId("person-save"));

    await waitFor(() => expect(created).toEqual({ relation: "sister", display_name: "Lulu" }));
    await waitFor(() => expect(within(card).getAllByTestId("person-tile")).toHaveLength(2));
  });

  it("edits a person, uploads the chosen photo and removes a person", async () => {
    let updated: unknown = null;
    let uploaded = false;
    let removed = false;
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/people": () => ({ body: { people: removed ? [] : [lulu], max: 12 } }),
      "PUT /api/people/p2": (init) => {
        updated = JSON.parse(String(init?.body));
        return { body: { person: { ...lulu, display_name: "Lulu Bear" } } };
      },
      "PUT /api/people/p2/photo": (init) => {
        uploaded = init?.body instanceof FormData;
        return { body: { person: { ...lulu, has_photo: true } } };
      },
      "DELETE /api/people/p2": () => {
        removed = true;
        return { status: 204 };
      },
    });
    renderApp({ routes: childRoutes, url: "/children/c1", user: teacher, options });

    fireEvent.click(await screen.findByTestId("person-tile"));
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByTestId("person-name"), { target: { value: "Lulu Bear" } });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "lulu.jpg", { type: "image/jpeg" });
    fireEvent.change(within(dialog).getByTestId("person-photo-input"), { target: { files: [file] } });
    fireEvent.click(within(dialog).getByTestId("person-save"));
    await waitFor(() => expect(uploaded).toBe(true));
    expect(updated).toEqual({ relation: "sister", display_name: "Lulu Bear" });

    fireEvent.click(await screen.findByTestId("person-tile"));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByTestId("person-remove"));
    await waitFor(() => expect(removed).toBe(true));
    await waitFor(() => expect(screen.queryByTestId("person-tile")).toBeNull());
  });

  it("refuses a file that is not an image before uploading", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/people": { body: { people: [], max: 12 } },
    });
    renderApp({ routes: childRoutes, url: "/children/c1", user: teacher, options });
    fireEvent.click(await screen.findByTestId("people-add"));
    const dialog = await screen.findByRole("dialog");
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(within(dialog).getByTestId("person-photo-input"), { target: { files: [file] } });
    expect(within(dialog).getByRole("alert")).toBeTruthy();
  });

  it("is RTL in Hebrew", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/people": { body: { people: [sido], max: 12 } },
    });
    renderApp({ routes: childRoutes, url: "/children/c1", user: { ...teacher, language: "he" }, options, locale: "he" });
    const card = await screen.findByTestId("people-card");
    expect(within(card).getByText("האנשים בחיים של Adam")).toBeTruthy();
    expect(await within(card).findByText("סבא")).toBeTruthy();
    expect(document.documentElement.dir).toBe("rtl");
  });
});

describe("PeopleStrip on the parent home", () => {
  it("shows the people read only", async () => {
    mockFetch({
      "GET /api/children": { body: { children: [{ ...adam, view: "parent" }], classes: [] } },
      "GET /api/children/c1/people": { body: { people: [sido, lulu], max: 12 } },
    });
    renderApp({ routes: parentRoutes, url: "/parent", user: parent, options });
    const strip = await screen.findByTestId("people-strip");
    expect(strip.textContent).toContain("Sido");
    expect(strip.textContent).toContain("Lulu");
    expect(screen.queryByTestId("people-add")).toBeNull();
  });
});

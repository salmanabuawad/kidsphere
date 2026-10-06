import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";
import { routes } from "./routes";

const options = {
  strengths: [
    { key: "imagination", icon: "🌈", label: { en: "Imagination", ar: "الخيال", he: "דמיון" } },
    { key: "building", icon: "🧱", label: { en: "Building", ar: "البناء", he: "בנייה" } },
  ],
  interests: [{ key: "animals", icon: "🐾", label: { en: "Animals", ar: "الحيوانات", he: "בעלי חיים" } }],
  content_types: [{ key: "story", label: { en: "Story", ar: "قصة", he: "סיפור" } }],
};

const adam = {
  id: "k1",
  name: "Adam Haddad",
  preferred_name: "Adam",
  birth_date: "2022-08-05",
  strengths: [{ key: "imagination", sources: ["parent"] }, { custom: "Kind to friends" }],
  interests: ["animals"],
};

describe("ParentHomePage", () => {
  it("shows a warm card per child with strengths, interests (from the detail) and the two actions", async () => {
    const basics = { id: adam.id, name: adam.name, preferred_name: adam.preferred_name, birth_date: adam.birth_date };
    mockFetch({
      "GET /api/children": { body: { children: [{ ...basics, has_photo: false, class: { id: "c1", name: "Butterflies", kindergarten: "Sunflower KG" } }], classes: [] } },
      "GET /api/children/k1": { body: { child: { ...adam, view: "parent" } } },
    });
    renderApp({ routes, url: "/parent", user: parent, options });
    expect(await screen.findByText("Hello, Dana")).toBeTruthy();
    const card = await screen.findByTestId("parent-child-k1");
    expect(within(card).getByText("Adam")).toBeTruthy();
    expect(within(card).getByText("Butterflies")).toBeTruthy();
    expect(await within(card).findByText("Imagination")).toBeTruthy();
    expect(within(card).getByText("Kind to friends")).toBeTruthy();
    expect(within(card).getByText("Animals")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Tell us about your child/ }).getAttribute("href")).toBe("/parent/children/k1/onboarding");
    expect(within(card).getByRole("link", { name: /Shared activities/ }).getAttribute("href")).toBe("/parent/children/k1/content");
  });

  it("accepts a bare array and children with no profile yet", async () => {
    mockFetch({ "GET /api/children": { body: [{ id: "k2", name: "Maya" }] } });
    renderApp({ routes, url: "/parent", user: parent, options });
    const card = await screen.findByTestId("parent-child-k2");
    expect(within(card).getByText(/Tell us what Maya loves/)).toBeTruthy();
  });

  it("has a friendly empty state", async () => {
    mockFetch({ "GET /api/children": { body: { children: [] } } });
    renderApp({ routes, url: "/parent", user: parent, options });
    expect(await screen.findByText("No children are connected to your account yet")).toBeTruthy();
  });

  it("is RTL in Arabic", async () => {
    mockFetch({ "GET /api/children": { body: { children: [adam] } } });
    renderApp({ routes, url: "/parent", user: { ...parent, language: "ar" }, locale: "ar", options });
    const card = await screen.findByTestId("parent-child-k1");
    expect(document.documentElement.dir).toBe("rtl");
    expect(within(card).getByText("الخيال")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /أخبرنا عن طفلك/ })).toBeTruthy();
  });

  it("is only for parents", async () => {
    mockFetch({ "GET /api/children": { body: { children: [adam] } } });
    renderApp({ routes, url: "/parent", user: teacher, options });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("parent-child-k1")).toBeNull();
  });
});

describe("ParentHomePage: the questionnaire", () => {
  const listed = { children: [{ id: "k1", name: "Adam Haddad", preferred_name: "Adam", birth_date: "2022-08-05" }] };
  const answers = (questionnaire: unknown, step: number) => ({
    child_id: "k1",
    perspective: "parent",
    parent_perspective: { sections: {}, entered: {} },
    questionnaire,
    wizard: { step, completed_at: null },
  });

  it("shows where the family is and continues at the saved step", async () => {
    mockFetch({
      "GET /api/children": { body: listed },
      "GET /api/children/k1": { body: { child: adam } },
      "GET /api/children/k1/profile": { body: answers({ status: "draft" }, 4) },
    });
    renderApp({ routes, url: "/parent", user: parent, options });
    const card = await screen.findByTestId("parent-child-k1");
    expect(await within(card).findByText("You are on step 4 of 9. Your answers are saved.")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Continue the questionnaire/ }).getAttribute("href")).toBe("/parent/children/k1/onboarding/4");
  });

  it("shows that the answers were sent", async () => {
    mockFetch({
      "GET /api/children": { body: listed },
      "GET /api/children/k1": { body: { child: adam } },
      "GET /api/children/k1/profile": { body: answers({ status: "submitted", submitted_at: "2026-10-02T08:00:00Z" }, 10) },
    });
    renderApp({ routes, url: "/parent", user: parent, options });
    const card = await screen.findByTestId("parent-child-k1");
    expect(await within(card).findByText("Sent to the kindergarten")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /View or update my answers/ }).getAttribute("href")).toBe("/parent/children/k1/onboarding/10");
  });

  it("invites the family to start", async () => {
    mockFetch({
      "GET /api/children": { body: listed },
      "GET /api/children/k1": { body: { child: adam } },
      "GET /api/children/k1/profile": { body: answers(null, 1) },
    });
    renderApp({ routes, url: "/parent", user: parent, options });
    const card = await screen.findByTestId("parent-child-k1");
    expect(await within(card).findByText("The getting-to-know questionnaire is waiting for you.")).toBeTruthy();
    expect(within(card).getByRole("link", { name: /Tell us about your child/ }).getAttribute("href")).toBe("/parent/children/k1/onboarding");
  });
});

describe("shared content placeholders", () => {
  it("lists shared titles", async () => {
    mockFetch({
      "GET /api/children/k1": { body: { child: adam } },
      "GET /api/children/k1/content": { body: { content: [{ id: "g1", title: "Adam builds a tower", content_type: "story" }] } },
    });
    renderApp({ routes, url: "/parent/children/k1/content", user: parent, options });
    const link = await screen.findByRole("link", { name: /Adam builds a tower/ });
    expect(link.getAttribute("href")).toBe("/parent/content/g1");
    expect(screen.getByText("Story")).toBeTruthy();
    expect(screen.getByText("Activities for Adam")).toBeTruthy();
  });

  it("reads a missing endpoint as nothing shared yet", async () => {
    mockFetch({});
    renderApp({ routes, url: "/parent/children/k1/content", user: parent, options });
    expect(await screen.findByText("Nothing has been shared yet")).toBeTruthy();
  });

  it("shows one item's title, or a gentle not-available message", async () => {
    mockFetch({ "GET /api/content/g1": { body: { content: { id: "g1", title: "Adam builds a tower", content_type: "story" } } } });
    renderApp({ routes, url: "/parent/content/g1", user: parent, options });
    expect(await screen.findByText("Adam builds a tower")).toBeTruthy();
  });

  it("handles 404 for one item", async () => {
    mockFetch({});
    renderApp({ routes, url: "/parent/content/zz", user: parent, options });
    expect(await screen.findByText("This activity isn't available")).toBeTruthy();
  });
});

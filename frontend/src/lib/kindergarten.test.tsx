import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routes as adminRoutes } from "@/features/admin/routes";
import { routes as childRoutes } from "@/features/children/routes";
import type { OptionLists } from "@/lib/options";
import { mockFetch, renderApp, teacher } from "@/test/utils";

const L = (en: string, ar: string, he: string) => ({ en, ar, he });
const options: OptionLists = {
  kindergarten_themes: [
    { key: "flowers", icon: "🌸", label: L("Flowers", "الأزهار", "פרחים") },
    { key: "sea", icon: "🌊", label: L("Sea", "البحر", "ים") },
  ],
};
const flowers = { name: "פרחים", theme: "flowers", classes: [{ id: "k1", name: "פרחים" }] };
const admin = { ...teacher, id: "u-admin", name: "Admin", role: "admin" as const };

describe("kindergarten in the app", () => {
  it("a teacher sees her kindergarten with its theme in the side nav, a top band and on the children page", async () => {
    mockFetch({
      "GET /api/me/kindergartens": { body: { kindergartens: [flowers] } },
      "GET /api/children": { body: { children: [], classes: [{ id: "k1", name: "פרחים", kindergarten: "פרחים" }] } },
    });
    renderApp({ routes: childRoutes, url: "/children", user: { ...teacher, language: "he" }, options, locale: "he" });
    const block = await screen.findByTestId("kindergarten-block");
    expect(block.textContent).toContain("גן");
    expect(block.textContent).toContain("פרחים");
    // The theme is painted, never an emoji in the nav.
    expect(within(block).getByTestId("kindergarten-tile").getAttribute("data-theme")).toBe("flowers");
    expect(block.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(screen.getByTestId("kindergarten-band").className).toContain("bg-paint-berry");
    const chips = await screen.findAllByTestId("kindergarten-chip");
    expect(chips.some((c) => c.getAttribute("data-theme") === "flowers")).toBe(true);
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("a kindergarten without a theme uses the default look and no band", async () => {
    mockFetch({
      "GET /api/me/kindergartens": { body: { kindergartens: [{ ...flowers, theme: null }] } },
      "GET /api/children": { body: { children: [], classes: [] } },
    });
    renderApp({ routes: childRoutes, url: "/children", user: teacher, options });
    const block = await screen.findByTestId("kindergarten-block");
    expect(within(block).getByTestId("kindergarten-tile").getAttribute("data-theme")).toBe("default");
    expect(screen.queryByTestId("kindergarten-band")).toBeNull();
  });

  it("the teacher home greets by name with the kindergarten's garden and the two everyday actions", async () => {
    mockFetch({
      "GET /api/me/kindergartens": { body: { kindergartens: [flowers] } },
      "GET /api/children": { body: { children: [], classes: [] } },
    });
    renderApp({ routes: childRoutes, url: "/children", user: { ...teacher, name: "Lena Cohen" }, options });
    const hero = await screen.findByTestId("home-hero");
    expect(within(hero).getByRole("heading", { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Lena$/);
    expect(within(hero).getByRole("link", { name: /Quick observation/ }).getAttribute("href")).toBe("/observe");
    expect(within(hero).getByRole("link", { name: /Add child/ }).getAttribute("href")).toBe("/children/new");
    await waitFor(() => expect(within(hero).getByTestId("home-garden").getAttribute("data-theme")).toBe("flowers"));
  });

  it("an admin picks a kindergarten's theme on the Classes page", async () => {
    let body: unknown = null;
    let theme: string | null = null;
    mockFetch({
      "GET /api/classes": () => ({ body: { classes: [{ id: "k1", name: "Roses", kindergarten: "Flowers", theme, teachers: [], child_count: 0 }] } }),
      "PUT /api/kindergartens/theme": (init) => {
        body = JSON.parse(String(init?.body));
        theme = "sea";
        return { body: { kindergarten: "Flowers", theme: "sea" } };
      },
    });
    renderApp({ routes: adminRoutes, url: "/admin/classes", user: admin, options });
    const picker = await screen.findByTestId("theme-Flowers");
    expect(within(picker).getByRole("radio", { name: "Default" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(picker).getByRole("radio", { name: /Sea/ }));
    await waitFor(() => expect(body).toEqual({ kindergarten: "Flowers", theme: "sea" }));
    await waitFor(() => expect(within(screen.getByTestId("theme-Flowers")).getByRole("radio", { name: /Sea/ }).getAttribute("aria-checked")).toBe("true"));
    // Admins manage every kindergarten: no kindergarten block in their nav.
    expect(screen.queryByTestId("kindergarten-block")).toBeNull();
  });
});

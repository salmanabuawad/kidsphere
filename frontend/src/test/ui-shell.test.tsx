import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { BookOpen, Plus, Users } from "lucide-react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "@/auth/AuthProvider";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Button, IconButton } from "@/components/ui/Button";
import { ToggleChip } from "@/components/ui/Chip";
import { Input, Select } from "@/components/ui/Field";
import { I18nProvider } from "@/i18n/I18nProvider";
import { buildNav, navFor, type AppRoute } from "@/lib/routing";
import { parent, renderApp, teacher } from "./utils";

function Page() {
  return <p>page body</p>;
}

const navRoutes: AppRoute[] = [
  { path: "/children", element: <Page />, roles: ["teacher", "admin"], nav: { labelKey: "nav.children", icon: Users, order: 10 } },
  { path: "/observe", element: <Page />, roles: ["teacher", "admin"], nav: { labelKey: "nav.observe", icon: Plus, order: 20, action: true } },
  { path: "/parent", element: <Page />, roles: ["parent"], nav: { labelKey: "nav.parentHome", icon: BookOpen, order: 10 } },
];

describe("touch targets (≥44px = h-11 / min-h-11; form controls 48px = h-12)", () => {
  const wrap = (ui: ReactNode) =>
    render(
      <AuthProvider initialUser={null}>
        <I18nProvider>{ui}</I18nProvider>
      </AuthProvider>,
    );

  it("md buttons and icon buttons are h-11", () => {
    wrap(
      <>
        <Button>Save</Button>
        <IconButton label="Close">x</IconButton>
      </>,
    );
    expect(screen.getByRole("button", { name: "Save" }).className).toMatch(/\bh-11\b/);
    expect(screen.getByRole("button", { name: "Close" }).className).toMatch(/\bh-11\b/);
  });

  it("toggle chips are min-h-11 and expose aria-pressed", () => {
    wrap(
      <ToggleChip selected onToggle={() => undefined} icon="🚗">
        Cars
      </ToggleChip>,
    );
    const chip = screen.getByRole("button", { name: /cars/i });
    expect(chip.className).toMatch(/\bmin-h-11\b/);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("inputs and selects are 48px (h-12) and the segmented language switch is 44px", () => {
    wrap(
      <>
        <Input aria-label="name" />
        <Select aria-label="pick">
          <option>a</option>
        </Select>
        <LocaleSwitcher variant="segmented" />
      </>,
    );
    expect(screen.getByLabelText("name").className).toMatch(/\bh-12\b/);
    expect(screen.getByLabelText("pick").className).toMatch(/\bh-12\b/);
    for (const r of screen.getAllByRole("radio")) expect(r.className).toMatch(/\bmin-h-11\b/);
  });
});

describe("nav metadata", () => {
  it("builds sorted nav items and filters them by role", () => {
    const nav = buildNav(navRoutes);
    expect(nav.map((n) => n.to)).toEqual(["/children", "/parent", "/observe"]);
    expect(navFor(nav, "teacher").map((n) => n.to)).toEqual(["/children", "/observe"]);
    expect(navFor(nav, "parent").map((n) => n.to)).toEqual(["/parent"]);
  });

  it("AppShell renders the centre action in the bottom bar for staff", async () => {
    renderApp({ routes: navRoutes, url: "/children", user: teacher });
    await screen.findAllByText("page body");
    const bars = screen.getAllByRole("navigation", { name: "Main navigation" });
    const bottom = bars.find((n) => n.className.includes("bottom-0"))!;
    expect(bottom).toBeTruthy();
    const links = within(bottom).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/children", "/observe"]);
    expect(within(bottom).getByText("Observation")).toBeTruthy();
  });

  it("parents get their own nav and no centre action", async () => {
    renderApp({ routes: navRoutes, url: "/parent", user: parent });
    await screen.findAllByText("page body");
    expect(screen.queryByText("Observation")).toBeNull();
    expect(screen.getAllByText("My children").length).toBeGreaterThan(0);
  });
});

describe("AppShell", () => {
  it("brands the top bar and side nav with the KidSphere logo linking home", async () => {
    const { container } = renderApp({ routes: navRoutes, url: "/children", user: teacher });
    await screen.findAllByText("page body");
    // One Brand in the side nav (lg) and one in the top bar (below lg); CSS shows one.
    const brands = screen.getAllByRole("link", { name: "KidSphere" });
    expect(brands).toHaveLength(2);
    for (const link of brands) {
      expect(link.getAttribute("href")).toBe("/");
      expect(within(link).getAllByAltText("KidSphere")).toHaveLength(1);
      expect(link.querySelector('[data-logo="inline"]')?.getAttribute("dir")).toBe("ltr");
      expect(link.querySelector("img.ks-logo-dark")).not.toBeNull();
    }
    const [side, top] = brands.map((l) => l.querySelector('[data-logo-part="mark"]')!.getAttribute("width"));
    expect([side, top]).toEqual(["40", "36"]);
    // The retired block-tower mark is not the brand any more.
    expect(container.ownerDocument.querySelector('[data-icon="brand-mark"]')).toBeNull();
  });

  it("is RTL-ready: Arabic labels and the document dir", async () => {
    renderApp({ routes: navRoutes, url: "/children", user: { ...teacher, language: "ar" }, locale: "ar" });
    await screen.findAllByText("page body");
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getAllByText("الأطفال").length).toBeGreaterThan(0);
  });

  it("renders inside a MemoryRouter without crashing for anonymous users of public pages", () => {
    render(
      <AuthProvider initialUser={null}>
        <I18nProvider>
          <MemoryRouter>
            <LocaleSwitcher />
          </MemoryRouter>
        </I18nProvider>
      </AuthProvider>,
    );
    expect(screen.getByTestId("locale-switcher")).toBeTruthy();
  });
});

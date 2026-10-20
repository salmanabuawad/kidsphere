import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Logo } from "@/components/brand/Logo";
import { EntrancePage } from "@/components/layout/EntrancePage";
import { createTranslator } from "@/i18n/translate";
import { BRANDS, brandName, brandOfPath, CURRENT_BRAND, entranceRedirect, IN_ENTRANCE } from "./brand";

const BOOT = readFileSync(resolve(process.cwd(), "public/boot.js"), "utf8");
const runBootAt = (path: string) => {
  window.history.pushState({}, "", path);
  new Function(BOOT)();
};

afterEach(() => window.history.pushState({}, "", "/"));

describe("entrances", () => {
  it("knows the entrance of a path", () => {
    expect(brandOfPath("/sharnaqa")?.key).toBe("sharnaqa");
    expect(brandOfPath("/nitzanim/children/7")?.key).toBe("nitzanim");
    expect(brandOfPath("/NITZANIM/")?.key).toBe("nitzanim");
    expect(brandOfPath("/")).toBeNull();
    expect(brandOfPath("/children")).toBeNull();
    expect(brandOfPath("/sharnaqa-old")).toBeNull();
  });

  it("the root shows the chooser; an old link moves under /sharnaqa with its query", () => {
    expect(entranceRedirect("/")).toBeNull();
    expect(entranceRedirect("/nitzanim/login")).toBeNull();
    expect(entranceRedirect("/children/7", "?tab=timeline", "#x")).toBe("/sharnaqa/children/7?tab=timeline#x");
    expect(entranceRedirect("/login")).toBe("/sharnaqa/login");
  });

  it("Sharnaqa is Arabic, Nitzanim Hebrew, each named in every language", () => {
    expect(BRANDS.sharnaqa.locale).toBe("ar");
    expect(BRANDS.nitzanim.locale).toBe("he");
    expect(brandName("he", BRANDS.nitzanim)).toBe("ניצנים");
    expect(brandName("ar", BRANDS.sharnaqa)).toBe("شرنقة");
    // Tests run at the root: the default product, outside an entrance.
    expect(IN_ENTRANCE).toBe(false);
    expect(CURRENT_BRAND.key).toBe("sharnaqa");
  });

  it("the welcome names the brand of the entrance", () => {
    expect(createTranslator("he").t("auth.welcome", { brand: brandName("he", BRANDS.nitzanim) })).toBe("ברוכים הבאים לניצנים");
    expect(createTranslator("ar").t("auth.welcome", { brand: brandName("ar", BRANDS.sharnaqa) })).toBe("أهلًا بكم في شرنقة");
  });

  it("boot.js starts each entrance in its language and remembers a switch per entrance", () => {
    runBootAt("/nitzanim/login");
    expect(document.documentElement.lang).toBe("he");
    runBootAt("/sharnaqa/login");
    expect(document.documentElement.lang).toBe("ar");
    window.localStorage.setItem("ks_locale_nitzanim", "en");
    runBootAt("/nitzanim/");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    runBootAt("/sharnaqa/");
    expect(document.documentElement.lang).toBe("ar"); // Sharnaqa keeps its own choice
  });

  it("the chooser links to both entrances, each in its own language", () => {
    render(<EntrancePage />);
    const sharnaqa = screen.getByTestId("entrance-sharnaqa");
    const nitzanim = screen.getByTestId("entrance-nitzanim");
    expect(sharnaqa.getAttribute("href")).toBe("/sharnaqa/");
    expect(sharnaqa.getAttribute("lang")).toBe("ar");
    expect(sharnaqa.textContent).toContain("شرنقة");
    expect(nitzanim.getAttribute("href")).toBe("/nitzanim/");
    expect(nitzanim.getAttribute("lang")).toBe("he");
    expect(nitzanim.textContent).toContain("ניצנים");
  });

  it("the Nitzanim logo is the cocoon art with the Hebrew name", () => {
    const { container } = render(<Logo variant="lockup" size={52} layout="inline" brand={BRANDS.nitzanim} />);
    expect(screen.getAllByAltText("ניצנים")).toHaveLength(1);
    expect(container.querySelector('[data-logo-part="wordmark-text"]')!.textContent).toBe("ניצנים");
    expect(container.querySelector(".ks-logo-light")).toBeNull();
  });
});

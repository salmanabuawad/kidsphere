import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BRAND_NAME, Logo } from "./Logo";

const imgs = (root: HTMLElement) => [...root.querySelectorAll("img")];

describe("Logo", () => {
  it("mark: one round mark with the alt text, sized by width/height", () => {
    const { container } = render(<Logo size={48} className="m-2" />);
    const [mark, ...rest] = imgs(container);
    expect(rest).toHaveLength(0);
    expect(screen.getAllByAltText(BRAND_NAME)).toEqual([mark]);
    expect(BRAND_NAME).toBe("KidSphere");
    expect(mark!.getAttribute("src")).toContain("kidsphere-mark");
    expect(mark!.getAttribute("width")).toBe("48");
    expect(mark!.getAttribute("height")).toBe("48");
    expect(mark!.className).toContain("object-contain");
    expect(mark!.className).toContain("m-2");
    // The app ships the compressed copies; the PNG masters stay in the design system.
    expect(mark!.getAttribute("src")).toMatch(/\.webp($|\?)/);
    expect(mark!.getAttribute("loading")).toBeNull();
  });

  it("lockup: the alt text once, both wordmark inks placed as decorative duplicates", () => {
    const { container } = render(<Logo variant="lockup" size={96} />);
    expect(imgs(container)).toHaveLength(3);
    expect(screen.getAllByAltText("KidSphere")).toHaveLength(1);
    expect(screen.getAllByRole("img", { name: "KidSphere" })).toHaveLength(1);

    const light = container.querySelector<HTMLImageElement>(".ks-logo-light")!;
    const dark = container.querySelector<HTMLImageElement>(".ks-logo-dark")!;
    expect(light.getAttribute("src")).toMatch(/kidsphere-wordmark(?!-dark)/);
    expect(dark.getAttribute("src")).toContain("kidsphere-wordmark-dark");
    for (const word of [light, dark]) {
      expect(word.getAttribute("alt")).toBe("");
      expect(word.getAttribute("aria-hidden")).toBe("true");
      // Lazy: the ink the theme hides (display: none) is never fetched.
      expect(word.getAttribute("loading")).toBe("lazy");
      expect(word.getAttribute("src")).toMatch(/\.webp($|\?)/);
      // Never stretched: the 527 x 131 art keeps its proportions.
      const ratio = Number(word.getAttribute("width")) / Number(word.getAttribute("height"));
      expect(Math.abs(ratio - 527 / 131)).toBeLessThan(0.05);
    }
  });

  it("stacked (as drawn) or inline (bars), and never mirrored", () => {
    const { container, rerender } = render(<Logo variant="lockup" size={96} className="mb-6" />);
    let root = container.firstElementChild as HTMLElement;
    expect(root.dataset.logo).toBe("stacked");
    expect(root.getAttribute("dir")).toBe("ltr");
    expect(root.className).toContain("flex-col");
    expect(root.className).toContain("mb-6");
    // The wordmark is as wide as in the drawn lockup: 527/322 of the mark.
    expect(container.querySelector(".ks-logo-light")!.getAttribute("width")).toBe(String(Math.round((96 * 527) / 322)));

    rerender(<Logo variant="lockup" layout="inline" size={36} />);
    root = container.firstElementChild as HTMLElement;
    expect(root.dataset.logo).toBe("inline");
    expect(root.getAttribute("dir")).toBe("ltr");
    expect(root.className).toContain("flex-row");
    expect(container.querySelector('[data-logo-part="mark"]')!.getAttribute("height")).toBe("36");
    expect(container.querySelector(".ks-logo-dark")!.getAttribute("height")).toBe("22");
  });
});

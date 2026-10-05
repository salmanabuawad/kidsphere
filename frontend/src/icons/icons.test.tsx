import { render } from "@testing-library/react";
import { createRef, type ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { NavMeta } from "@/lib/routing";
import {
  ArrowNextIcon,
  BlockIcon,
  BrandMarkIcon,
  ChildrenIcon,
  ObserveAddIcon,
  StoryIcon,
  StrengthsIcon,
  WhatHelpsIcon,
  iconDefs,
  kidIcons,
  type KidIconName,
} from "@/icons";

// Compile-time checks: the custom icons drop into lucide slots and nav metadata unchanged.
const asLucide: LucideIcon = ChildrenIcon;
const navMeta: NavMeta = { labelKey: "nav.observe", icon: ObserveAddIcon, order: 50, action: true };

/** Spec 5.4: 27 icons plus the brand mark. */
const SPEC_NAMES: KidIconName[] = [
  "children",
  "observe-add",
  "timeline",
  "development",
  "content",
  "account",
  "users",
  "classes",
  "parent-home",
  "story",
  "video",
  "game",
  "activity",
  "pack",
  "strength-builder",
  "growth-support",
  "strengths",
  "interests",
  "what-helps",
  "current-focus",
  "attention",
  "note-quote",
  "worked-well",
  "partly",
  "did-not-work",
  "present",
  "arrow-next",
  "brand-mark",
];

/** Spec 5.3: these flip under RTL; the star, heart, check, play triangle and lens never do. */
const MIRRORED: KidIconName[] = ["timeline", "development", "story", "current-focus", "note-quote", "partly", "did-not-work", "arrow-next"];

function svgOf(ui: ReactElement) {
  const { container } = render(ui);
  return container.querySelector("svg")!;
}

describe("KidSphere icon set", () => {
  it("has exactly the spec's icons, each exported as <PascalCase>Icon", () => {
    expect(Object.keys(iconDefs).sort()).toEqual([...SPEC_NAMES].sort());
    expect(Object.keys(kidIcons).sort()).toEqual([...SPEC_NAMES].sort());
    expect(StoryIcon.displayName).toBe("StoryIcon");
    expect(kidIcons["what-helps"].displayName).toBe("WhatHelpsIcon");
    expect(asLucide).toBe(ChildrenIcon);
    expect(navMeta.icon).toBe(ObserveAddIcon);
  });

  it.each(SPEC_NAMES)("%s renders a 24x24, aria-hidden, currentColor SVG", (name) => {
    const Icon = kidIcons[name];
    const svg = svgOf(<Icon />);
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("data-icon")).toBe(name);
    expect(svg.getAttribute("class")).toContain(`ks-icon-${name}`);
    expect(svg.querySelectorAll("path, circle, rect, polygon").length).toBeGreaterThan(0);
    expect(svg.getAttribute("class")!.includes("rtl:-scale-x-100")).toBe(MIRRORED.includes(name));
  });

  it("paints one primitive under the outline with a token variable and a fallback", () => {
    const svg = svgOf(<StoryIcon />);
    const paint = svg.querySelector("g[stroke='none']") as SVGGElement;
    expect(paint).not.toBeNull();
    expect(svg.firstElementChild).toBe(paint);
    expect(paint.style.fill).toBe("var(--icon-paint, var(--paint-sky, #33A7E0))");
    expect(paint.getAttribute("transform")).toBe("translate(0 1.5)");

    const star = svgOf(<StrengthsIcon />).querySelector("g[stroke='none']") as SVGGElement;
    expect(star.style.fill).toBe("var(--icon-paint, var(--paint-sun, #FDC010))");
    const nav = svgOf(<ChildrenIcon />).querySelector("g[stroke='none']") as SVGGElement;
    expect(nav.style.fill).toBe("var(--icon-paint, var(--brand, #005DBD))");
  });

  it("supports outline-only, a custom paint, and no slip at small sizes", () => {
    expect(svgOf(<WhatHelpsIcon paint={false} />).querySelector("g[stroke='none']")).toBeNull();
    const custom = svgOf(<ChildrenIcon paint="var(--paint-sky)" />).querySelector("g[stroke='none']") as SVGGElement;
    expect(custom.style.fill).toBe("var(--paint-sky)");
    const small = svgOf(<StrengthsIcon size={16} />);
    expect(small.getAttribute("width")).toBe("16");
    expect(small.querySelector("g[stroke='none']")!.getAttribute("transform")).toBeNull();
    expect(svgOf(<StrengthsIcon size={16} slip />).querySelector("g[stroke='none']")!.getAttribute("transform")).toBe("translate(0 1.5)");
  });

  it("scales the heavier strokes with strokeWidth, like lucide", () => {
    const svg = svgOf(<ObserveAddIcon strokeWidth={2.25} />);
    expect(svg.getAttribute("stroke-width")).toBe("2.25");
    const heavy = [...svg.querySelectorAll("path")].map((p) => p.getAttribute("stroke-width"));
    expect(heavy).toEqual(["3.375", "2.8125"]);
    expect(svgOf(<ArrowNextIcon size={48} absoluteStrokeWidth />).getAttribute("stroke-width")).toBe("1");
  });

  it("passes className, aria props, refs and mirror overrides through", () => {
    const ref = createRef<SVGSVGElement>();
    const svg = svgOf(<ArrowNextIcon ref={ref} className="size-9" aria-label="Next" mirror={false} />);
    expect(ref.current).toBe(svg);
    expect(svg.getAttribute("class")).toContain("size-9");
    expect(svg.getAttribute("class")).not.toContain("rtl:-scale-x-100");
    expect(svg.getAttribute("aria-label")).toBe("Next");
    expect(svg.hasAttribute("aria-hidden")).toBe(false);
  });

  it("renders the brand mark as three flat fills without an outline", () => {
    const svg = svgOf(<BrandMarkIcon />);
    const shapes = [...svg.querySelectorAll("path, circle, rect")] as SVGElement[];
    expect(shapes).toHaveLength(3);
    expect(shapes.map((s) => s.getAttribute("stroke"))).toEqual(["none", "none", "none"]);
    expect(shapes.map((s) => s.style.fill)).toEqual(["var(--brand, #005DBD)", "var(--paint-sun, #FDC010)", "var(--paint-berry, #EE4E89)"]);
  });

  it("BlockIcon renders an icon by name", () => {
    const svg = svgOf(<BlockIcon name="current-focus" size={20} className="text-ink" />);
    expect(svg.getAttribute("data-icon")).toBe("current-focus");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("class")).toContain("text-ink");
  });
});

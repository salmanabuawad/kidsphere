import { createElement, forwardRef, type ForwardRefExoticComponent, type ReactNode, type RefAttributes } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";
import { iconDefs, type IconElement, type KidIconDef, type KidIconName, type PaintKey } from "./defs";

/**
 * CSS colour of each paint: the design token, with its light-theme value as the
 * fallback so an icon still paints before (or without) the token sheet.
 */
export const PAINTS: Record<PaintKey, string> = {
  brand: "var(--brand, #005DBD)",
  sky: "var(--paint-sky, #33A7E0)",
  sun: "var(--paint-sun, #FDC010)",
  berry: "var(--paint-berry, #EE4E89)",
  leaf: "var(--paint-leaf, #4DB956)",
  grape: "var(--paint-grape, #BC6ECE)",
  tangerine: "var(--paint-tangerine, #FA8927)",
};

/**
 * "Hand-painted" slip: the paint sits this many viewBox units lower than its
 * outline, so a sliver of colour shows under the bottom edge. (A 1-unit slip
 * would hide completely under the 2-unit outline.)
 */
export const PAINT_SLIP = 1.5;

/**
 * Same props as a lucide-react icon (size, color, strokeWidth, absoluteStrokeWidth,
 * className and any SVG attribute), plus the duotone controls.
 */
export interface KidIconProps extends LucideProps {
  /**
   * The painted primitive. `true` (default): the icon's own paint, which a parent
   * can override with the CSS variable `--icon-paint` (e.g. `[--icon-paint:var(--brand)]`
   * on an active nav link, `[--icon-paint:transparent]` on an inactive one).
   * `false`: outline only, for icons on a solid fill. A string: any CSS colour.
   */
  paint?: boolean | string;
  /** Paint slip (see PAINT_SLIP). Default: on, except when `size` is a number below 20. */
  slip?: boolean;
  /** Flip horizontally under RTL (`rtl:-scale-x-100`). Default: per icon (spec 5.3). */
  mirror?: boolean;
}

export type KidIcon = ForwardRefExoticComponent<Omit<KidIconProps, "ref"> & RefAttributes<SVGSVGElement>>;

function hasA11yProp(props: object) {
  return Object.keys(props).some((k) => k.startsWith("aria-") || k === "role" || k === "title");
}

function pascal(name: string) {
  return name.replace(/(^|-)(\w)/g, (_m, _dash, c: string) => c.toUpperCase());
}

/**
 * Build one KidSphere icon component from its master geometry. The result is a
 * drop-in for a lucide icon (`LucideIcon`), so it can sit in `NavMeta.icon`.
 *
 * Markup: an inline 24x24 SVG; the outline is `stroke="currentColor"` (set the
 * text colour: `ink`, `ink-muted`, `on-brand`...), the paint is a fill under the
 * outline, and the SVG is `aria-hidden` unless it gets an aria-* prop, role or title.
 */
export function createKidIcon(name: KidIconName): KidIcon {
  const def: KidIconDef = iconDefs[name];

  const Icon = forwardRef<SVGSVGElement, KidIconProps>(function KidIcon(
    { color = "currentColor", size = 24, strokeWidth = 2, absoluteStrokeWidth, paint = true, slip, mirror, className, children, ...rest },
    ref,
  ) {
    const sw = absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth;
    const swNum = Number(sw);
    const px = Number(size);
    const slipped = slip ?? !(Number.isFinite(px) && px < 20);

    const shapes = (els: readonly IconElement[] | undefined, extra?: Record<string, unknown>) =>
      (els ?? []).map(([tag, attrs, weight], i) =>
        createElement(tag, {
          key: i,
          ...attrs,
          ...extra,
          // Heavier strokes (the plus, the handle, the check, the arrow) scale with strokeWidth.
          strokeWidth: weight && Number.isFinite(swNum) ? swNum * weight : undefined,
        }),
      );

    const body: ReactNode[] = [];
    if (def.flat) {
      def.flat.forEach(([[tag, attrs], key], i) =>
        body.push(createElement(tag, { key: `flat${i}`, ...attrs, stroke: "none", style: { fill: paint === false ? color : PAINTS[key] } })),
      );
    }
    const fill = paint === false ? null : typeof paint === "string" ? paint : def.paint ? `var(--icon-paint, ${PAINTS[def.paint]})` : null;
    if (def.fill && fill) {
      body.push(
        <g key="paint" stroke="none" style={{ fill }} transform={slipped ? `translate(0 ${PAINT_SLIP})` : undefined}>
          {shapes(def.fill)}
        </g>,
      );
    }
    body.push(...shapes(def.line));
    if (def.ink) {
      body.push(
        <g key="ink" fill={color} stroke="none">
          {shapes(def.ink)}
        </g>,
      );
    }

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-icon={name}
        className={cn("ks-icon", `ks-icon-${name}`, (mirror ?? !!def.mirror) && "rtl:-scale-x-100", className)}
        {...(!children && !hasA11yProp(rest) ? { "aria-hidden": true } : null)}
        {...rest}
      >
        {body}
        {children}
      </svg>
    );
  });
  Icon.displayName = `${pascal(name)}Icon`;
  return Icon;
}

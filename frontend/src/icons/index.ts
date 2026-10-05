/**
 * KidSphere icons: custom painted block glyphs for nav, sections, actions,
 * content types, statuses and feedback. Utility glyphs (chevrons, X, search,
 * pencil, trash, check...) stay lucide-react; option emoji stay content.
 *
 * Colour: the outline is currentColor; the one painted primitive uses its paint
 * token (`--paint-*`, or `--brand` for nav icons) unless `paint` or the CSS
 * variable `--icon-paint` says otherwise.
 */
export { BlockIcon, type BlockIconProps } from "./BlockIcon";
export { iconDefs, type IconElement, type KidIconDef, type KidIconName, type PaintKey } from "./defs";
export * from "./icons";
export { PAINT_SLIP, PAINTS, createKidIcon, type KidIcon, type KidIconProps } from "./KidIcon";

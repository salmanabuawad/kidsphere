import markUrl from "@/assets/brand/sharnaqa-mark.webp";
import wordmarkUrl from "@/assets/brand/sharnaqa-wordmark.webp";
import wordmarkDarkUrl from "@/assets/brand/sharnaqa-wordmark-dark.webp";
import { CURRENT_BRAND, type Brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * The brand name exactly as the logo spells it, in every interface language (the alt text is the
 * logo's own words): "Sharnaqa" under /sharnaqa, "ניצנים" under /nitzanim (lib/brand).
 */
export const BRAND_NAME = logoName(CURRENT_BRAND);

export function logoName(brand: Brand): string {
  return brand.key === "nitzanim" ? brand.names.he : brand.names.en;
}

/*
 * Pixel sizes of the processed brand art in src/assets/brand (cut by design-system/make_logo.py):
 * the mark is a square rounded tile (the egg and the butterfly on the artwork's cream), the
 * wordmark carries a 6px transparent margin and includes the leaf above and the "q" below, and
 * in the drawn (stacked) lockup the wordmark sits 14px under the 470px mark. The app ships the
 * script's compressed WebP copies; the PNG masters stay in design-system/project/assets/Logos.
 */
const MARK_PX = 470;
const WORD_W = 639;
const WORD_H = 173;
const STACK_GAP = 14;
/** Inline lockup (bars): the wordmark image is 0.75 of the mark's height and sits 0.22 of it away (8px at 36). */
const INLINE_WORD = 0.75;
const INLINE_GAP = 0.22;

export type LogoProps = {
  /** "mark": the egg-and-child tile only. "lockup": the mark with the Sharnaqa wordmark. */
  variant?: "mark" | "lockup";
  /** Side of the square mark in CSS px; the wordmark scales with it. */
  size?: number;
  /** Lockup only. "stacked": the wordmark under the mark, as drawn. "inline": beside it, for the top bar and side nav. */
  layout?: "stacked" | "inline";
  className?: string;
};

const IMG = "shrink-0 object-contain select-none";

/**
 * The Sharnaqa logo (design-system/project/assets/Logos).
 *
 * - The mark reads the same on light and dark grounds. The wordmark comes in two inks (plum,
 *   or chalk for dark grounds, the leaf teal in both); both are placed and the theme shows one through
 *   `.ks-logo-light` / `.ks-logo-dark` (index.css), which follow the token rule:
 *   prefers-color-scheme, unless `<html data-theme>` says otherwise.
 * - The wordmark images are `loading="lazy"`: a browser never fetches a lazy image that is
 *   `display: none`, so only the ink the theme shows is downloaded.
 * - The mark carries the alt text, once; the wordmark images are decorative duplicates.
 * - width/height are always set (no layout shift) and `object-contain` keeps the art from
 *   ever stretching. The lockup is laid out LTR in every language: the logo is never mirrored.
 */
export function Logo({ variant = "mark", size = 40, layout = "stacked", className, brand = CURRENT_BRAND }: LogoProps & { brand?: Brand }) {
  const name = logoName(brand);
  const mark = (
    <img
      src={markUrl}
      alt={name}
      width={size}
      height={size}
      draggable={false}
      data-logo-part="mark"
      className={cn(IMG, variant === "mark" && className)}
    />
  );
  if (variant === "mark") return mark;

  const inline = layout === "inline";
  const wordH = Math.round(inline ? size * INLINE_WORD : (size * WORD_H) / MARK_PX);
  const wordW = Math.round((wordH * WORD_W) / WORD_H);
  const gap = Math.round(inline ? size * INLINE_GAP : (size * STACK_GAP) / MARK_PX);
  const wordmark = (src: string, theme: "light" | "dark") => (
    <img
      src={src}
      alt=""
      aria-hidden
      width={wordW}
      height={wordH}
      loading="lazy"
      draggable={false}
      data-logo-part={`wordmark-${theme}`}
      className={cn(IMG, theme === "light" ? "ks-logo-light" : "ks-logo-dark")}
    />
  );

  return (
    <span
      dir="ltr"
      data-logo={inline ? "inline" : "stacked"}
      className={cn("inline-flex shrink-0 items-center", inline ? "flex-row" : "flex-col", className)}
      style={{ gap }}
    >
      {mark}
      {brand.key === "nitzanim" ? (
        // No Nitzanim wordmark art yet: the name in the display face, in the logo's ink.
        <span
          aria-hidden
          dir="rtl"
          lang="he"
          className="font-display shrink-0 leading-none font-bold text-ink select-none"
          style={{ fontSize: Math.round(wordH * 0.62) }}
          data-logo-part="wordmark-text"
        >
          {name}
        </span>
      ) : (
        <>
          {wordmark(wordmarkUrl, "light")}
          {wordmark(wordmarkDarkUrl, "dark")}
        </>
      )}
    </span>
  );
}

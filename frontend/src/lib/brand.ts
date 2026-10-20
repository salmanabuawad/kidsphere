import type { AppLocale } from "@/i18n/config";

/**
 * One system, two entrances (2026-10-20): kids.kortexd.com/sharnaqa is the Arabic product
 * (Sharnaqa, شرنقة) and kids.kortexd.com/nitzanim the Hebrew one (Nitzanim, ניצנים). They share
 * the database, the users and the API (/api); the entrance decides the router base, the brand
 * name and the language a page load starts in (people can still switch language). The bare
 * root shows a chooser (EntrancePage); any other path without an entrance is an old link and
 * moves under /sharnaqa.
 */
export type BrandKey = "sharnaqa" | "nitzanim";

export type Brand = {
  key: BrandKey;
  /** The router basename. */
  base: `/${BrandKey}`;
  /** The language a page load starts in. */
  locale: AppLocale;
  /** The brand's name in each interface language (the logo's alt text, the title, the welcome). */
  names: Record<AppLocale, string>;
};

export const BRANDS: Record<BrandKey, Brand> = {
  sharnaqa: { key: "sharnaqa", base: "/sharnaqa", locale: "ar", names: { ar: "شرنقة", he: "שרנקה", en: "Sharnaqa" } },
  nitzanim: { key: "nitzanim", base: "/nitzanim", locale: "he", names: { ar: "نيتسانيم", he: "ניצנים", en: "Nitzanim" } },
};

/** The entrance a path belongs to ("/nitzanim/children/1" → nitzanim), or null. */
export function brandOfPath(pathname: string): Brand | null {
  const first = pathname.split("/")[1]?.toLowerCase();
  return first === "sharnaqa" || first === "nitzanim" ? BRANDS[first] : null;
}

/** Where a path without an entrance goes: the root shows the chooser, anything else is an old link. */
export function entranceRedirect(pathname: string, search = "", hash = ""): string | null {
  if (brandOfPath(pathname)) return null;
  if (pathname === "/" || pathname === "") return null;
  return `${BRANDS.sharnaqa.base}${pathname}${search}${hash}`;
}

/**
 * The brand of this page load. Read once from the address: the router never leaves its base,
 * so it cannot change without a full load. Outside an entrance (the chooser, tests) it is
 * Sharnaqa, the default product.
 */
export const CURRENT_BRAND: Brand =
  (typeof window !== "undefined" && brandOfPath(window.location.pathname)) || BRANDS.sharnaqa;

/** True when this page load is inside an entrance (not the chooser at the root). */
export const IN_ENTRANCE: boolean = typeof window !== "undefined" && brandOfPath(window.location.pathname) !== null;

/** The brand's name in a language. */
export function brandName(locale: AppLocale, brand: Brand = CURRENT_BRAND): string {
  return brand.names[locale];
}

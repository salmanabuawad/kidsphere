import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { useFetch } from "./useFetch";

/**
 * Kindergartens (backend services/kindergartens.py): the kindergartens the signed-in user
 * works in (teacher), sees through their children (parent) or manages (admin), each with its
 * theme. A theme is a `kindergarten_themes` key turned into one play paint: a painted
 * primitive (never an emoji: emoji are content, not chrome) and a soft tint. No theme = the
 * default look (the logo teal on `tray`).
 */
export type Kindergarten = { name: string; theme: string | null; classes: { id: string; name: string }[] };

/** Theme key → its play paint: a solid fill, the same paint as an SVG fill, and a soft tint. */
export const THEME_PAINT: Record<string, { paint: string; fill: string; soft: string }> = {
  flowers: { paint: "bg-paint-berry", fill: "fill-paint-berry", soft: "bg-paint-berry/15" },
  sun: { paint: "bg-paint-sun", fill: "fill-paint-sun", soft: "bg-paint-sun/20" },
  sea: { paint: "bg-paint-sky", fill: "fill-paint-sky", soft: "bg-paint-sky/15" },
  forest: { paint: "bg-paint-leaf", fill: "fill-paint-leaf", soft: "bg-paint-leaf/15" },
  butterflies: { paint: "bg-paint-grape", fill: "fill-paint-grape", soft: "bg-paint-grape/15" },
  rainbow: { paint: "bg-paint-tangerine", fill: "fill-paint-tangerine", soft: "bg-paint-tangerine/15" },
};
const DEFAULT_LOOK = { paint: "bg-accent", fill: "fill-accent", soft: "bg-tray" };

export function themeLook(theme: string | null | undefined) {
  return (theme && THEME_PAINT[theme]) || DEFAULT_LOOK;
}

/** The user's kindergartens (none while signed out or on an error). */
export function useMyKindergartens(): Kindergarten[] {
  const { user } = useAuth();
  const { data } = useFetch<{ kindergartens: Kindergarten[] }>(user ? "/api/me/kindergartens" : null);
  return data?.kindergartens ?? [];
}

/**
 * The kindergarten's mark: a block-icon flower (a leaf stem, a ball head in the theme's paint,
 * a sun-paint centre) with the 2px ink outline, on a surface tile. Decorative: the name is
 * written next to it.
 */
export function KindergartenTile({ theme, className }: { theme: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-md border-[1.5px] border-ink bg-surface", className)}
      data-testid="kindergarten-tile"
      data-theme={theme ?? "default"}
    >
      <svg viewBox="0 0 24 24" className="size-[70%]" fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="11" y="12" width="2" height="9" rx="1" className="fill-paint-leaf" />
        <circle cx="12" cy="8" r="4.5" className={themeLook(theme).fill} />
        <circle cx="12" cy="8" r="1.6" className="fill-paint-sun" />
      </svg>
    </span>
  );
}

/** A painted ball in the theme's paint (the chip's lead). */
export function ThemeDot({ theme, className }: { theme: string | null | undefined; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-5 shrink-0 rounded-full border-[1.5px] border-ink", themeLook(theme).paint, className)} />;
}

/** A small chip: the theme's painted ball and the kindergarten's name on its soft tint. */
export function KindergartenChip({ kindergarten, className }: { kindergarten: Pick<Kindergarten, "name" | "theme">; className?: string }) {
  return (
    <span
      className={cn("inline-flex min-h-8 items-center gap-2 rounded-sm py-1 ps-1.5 pe-3 text-sm font-semibold text-ink", themeLook(kindergarten.theme).soft, className)}
      data-testid="kindergarten-chip"
      data-theme={kindergarten.theme ?? "default"}
    >
      <ThemeDot theme={kindergarten.theme} />
      <span dir="auto" className="min-w-0 truncate">
        {kindergarten.name}
      </span>
    </span>
  );
}

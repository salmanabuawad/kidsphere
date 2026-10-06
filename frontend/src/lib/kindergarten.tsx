import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { useOptions } from "./options";
import { useFetch } from "./useFetch";

/**
 * Kindergartens (backend services/kindergartens.py): the kindergartens the signed-in user
 * works in (teacher), sees through their children (parent) or manages (admin), each with its
 * theme. A theme is a `kindergarten_themes` key; its emoji and label come from GET /api/options
 * and its colour is one of the play paints below. No theme = the default look.
 */
export type Kindergarten = { name: string; theme: string | null; classes: { id: string; name: string }[] };

/** Theme key → play paint (a solid block colour) and its soft tint. */
export const THEME_PAINT: Record<string, { paint: string; soft: string }> = {
  flowers: { paint: "bg-paint-berry", soft: "bg-paint-berry/15" },
  sun: { paint: "bg-paint-sun", soft: "bg-paint-sun/20" },
  sea: { paint: "bg-paint-sky", soft: "bg-paint-sky/15" },
  forest: { paint: "bg-paint-leaf", soft: "bg-paint-leaf/15" },
  butterflies: { paint: "bg-paint-grape", soft: "bg-paint-grape/15" },
  rainbow: { paint: "bg-paint-tangerine", soft: "bg-paint-tangerine/15" },
};
const DEFAULT_LOOK = { paint: "bg-tray", soft: "bg-tray" };

export function themeLook(theme: string | null | undefined) {
  return (theme && THEME_PAINT[theme]) || DEFAULT_LOOK;
}

/** The user's kindergartens (none while signed out or on an error). */
export function useMyKindergartens(): Kindergarten[] {
  const { user } = useAuth();
  const { data } = useFetch<{ kindergartens: Kindergarten[] }>(user ? "/api/me/kindergartens" : null);
  return data?.kindergartens ?? [];
}

/** The emoji of a theme (🏡 for the default look). */
export function useThemeEmoji() {
  const { item } = useOptions();
  return (theme: string | null | undefined) => (theme ? item("kindergarten_themes", theme)?.icon : undefined) ?? "🏡";
}

/** A kindergarten's painted emoji tile (decorative; the name is written next to it). */
export function KindergartenTile({ theme, className }: { theme: string | null | undefined; className?: string }) {
  const emoji = useThemeEmoji();
  return (
    <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-md border-[1.5px] border-ink text-xl leading-none", themeLook(theme).paint, className)}>
      {emoji(theme)}
    </span>
  );
}

/** A small chip: the kindergarten's emoji and name in its soft colour. */
export function KindergartenChip({ kindergarten, className }: { kindergarten: Pick<Kindergarten, "name" | "theme">; className?: string }) {
  const emoji = useThemeEmoji();
  return (
    <span
      className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm font-semibold text-ink", themeLook(kindergarten.theme).soft, className)}
      data-testid="kindergarten-chip"
      data-theme={kindergarten.theme ?? "default"}
    >
      <span aria-hidden>{emoji(kindergarten.theme)}</span>
      <span dir="auto">{kindergarten.name}</span>
    </span>
  );
}

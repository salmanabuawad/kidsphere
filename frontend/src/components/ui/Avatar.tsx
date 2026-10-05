import { cn, initials } from "@/lib/utils";

/**
 * Avatar block (spec 6.20): a rounded square, never a circle and never a hashed
 * colour, so it can't look like a meaning. Initials in the display face on `tray`,
 * or a photo in the same block.
 *   sm 32 · md 40 · lg 48 · xl 80
 */
export const AVATAR_SIZES = {
  sm: "size-8 rounded-sm text-caption",
  md: "size-10 rounded-md text-[15px]",
  lg: "size-12 rounded-md text-lg",
  xl: "size-20 rounded-lg text-[28px]",
} as const;

export type AvatarSize = keyof typeof AVATAR_SIZES;

export function Avatar({ name, src, size = "md", className }: { name: string; src?: string | null; size?: AvatarSize; className?: string }) {
  const s = AVATAR_SIZES[size];
  if (src) return <img src={src} alt="" className={cn("shrink-0 border border-line bg-tray object-cover", s, className)} />;
  return (
    <span
      aria-hidden
      className={cn("font-display inline-flex shrink-0 items-center justify-center border border-line bg-tray leading-none font-semibold text-ink", s, className)}
    >
      {initials(name)}
    </span>
  );
}

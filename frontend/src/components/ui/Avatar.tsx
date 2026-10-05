import { cn, avatarColor, initials } from "@/lib/utils";

/** Initials avatar, or a photo when `src` is given (e.g. /api/children/{id}/photo). */
export function Avatar({
  name,
  src,
  color,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const s = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-24 text-3xl" }[size];
  if (src) return <img src={src} alt="" className={cn("shrink-0 rounded-full object-cover ring-2 ring-white", s, className)} />;
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white", s, className)}
      style={{ backgroundColor: color ?? avatarColor(name) }}
    >
      {initials(name)}
    </span>
  );
}

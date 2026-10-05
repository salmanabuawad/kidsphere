import { useState } from "react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { photoUrl } from "./api";

const SIZES = { sm: "size-8", md: "size-10", lg: "size-14", xl: "size-24" } as const;

/** The child's photo (served only through the authenticated API) or initials. */
export function ChildAvatar({
  child,
  size = "md",
  className,
}: {
  child: { id: string; name: string; has_photo: boolean; updated_at?: string | null };
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const src = child.has_photo ? photoUrl(child.id, child.updated_at) : null;
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <Avatar name={child.name} size={size} className={className} />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(src)}
      className={cn("shrink-0 rounded-full bg-stone-100 object-cover ring-2 ring-white", SIZES[size], className)}
    />
  );
}

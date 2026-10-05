import { useState } from "react";
import { AVATAR_SIZES, Avatar, type AvatarSize } from "@/components/ui";
import { cn } from "@/lib/utils";
import { photoUrl } from "./api";

/** The child's photo (served only through the authenticated API) or initials, in the shared avatar block. */
export function ChildAvatar({
  child,
  size = "md",
  className,
}: {
  child: { id: string; name: string; has_photo: boolean; updated_at?: string | null };
  size?: AvatarSize;
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
      className={cn("shrink-0 border border-line bg-tray object-cover", AVATAR_SIZES[size], className)}
    />
  );
}

import { useState } from "react";
import { AVATAR_SIZES, type AvatarSize } from "@/components/ui";
import { useOptions } from "@/lib/options";
import { cn } from "@/lib/utils";
import { photoOf, type Person } from "./api";

/** The person's photo (served only through the API), else their relation's emoji in the shared avatar block. */
export function PersonAvatar({
  person,
  size = "md",
  className,
}: {
  person: Pick<Person, "id" | "display_name" | "relation" | "has_photo" | "updated_at">;
  size?: AvatarSize;
  className?: string;
}) {
  const { item } = useOptions();
  const src = person.id ? photoOf(person) : null;
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src)
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(src)}
        className={cn("shrink-0 border border-line bg-tray object-cover", AVATAR_SIZES[size], className)}
      />
    );
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center border border-line bg-tray leading-none", AVATAR_SIZES[size], className)}>
      {item("person_relations", person.relation)?.icon ?? "💛"}
    </span>
  );
}

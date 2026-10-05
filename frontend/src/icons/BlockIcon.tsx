import type { KidIconName } from "./defs";
import { kidIcons } from "./icons";
import type { KidIconProps } from "./KidIcon";

export type BlockIconProps = Omit<KidIconProps, "ref"> & { name: KidIconName };

/**
 * A KidSphere icon by name, for data-driven places (content types, feedback,
 * timeline entries): <BlockIcon name="story" size={28} />.
 */
export function BlockIcon({ name, ...props }: BlockIconProps) {
  const Icon = kidIcons[name];
  return <Icon {...props} />;
}

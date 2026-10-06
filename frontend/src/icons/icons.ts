import type { KidIconName } from "./defs";
import { createKidIcon, type KidIcon } from "./KidIcon";

/*
 * The KidSphere icon set (design spec section 5.4), one component per icon.
 * Each is a drop-in for a lucide icon: <StoryIcon className="size-5" />.
 */

// Navigation (paint: the logo teal `accent` when active, via --icon-paint; outline only when inactive)
export const ChildrenIcon = createKidIcon("children");
export const ObserveAddIcon = createKidIcon("observe-add");
export const TimelineIcon = createKidIcon("timeline");
export const DevelopmentIcon = createKidIcon("development");
export const ContentIcon = createKidIcon("content");
export const AccountIcon = createKidIcon("account");
export const UsersIcon = createKidIcon("users");
export const ClassesIcon = createKidIcon("classes");
export const ParentHomeIcon = createKidIcon("parent-home");

// Content types (paint: sky)
export const StoryIcon = createKidIcon("story");
export const VideoIcon = createKidIcon("video");
export const GameIcon = createKidIcon("game");
export const ActivityIcon = createKidIcon("activity");
export const PackIcon = createKidIcon("pack");

// Modes
export const StrengthBuilderIcon = createKidIcon("strength-builder");
export const GrowthSupportIcon = createKidIcon("growth-support");

// Profile meanings
export const StrengthsIcon = createKidIcon("strengths");
export const InterestsIcon = createKidIcon("interests");
export const WhatHelpsIcon = createKidIcon("what-helps");
export const CurrentFocusIcon = createKidIcon("current-focus");
export const AttentionIcon = createKidIcon("attention");
export const NoteQuoteIcon = createKidIcon("note-quote");

// "How did it go?" feedback: one neutral treatment, the same sun ball on all three
export const WorkedWellIcon = createKidIcon("worked-well");
export const PartlyIcon = createKidIcon("partly");
export const DidNotWorkIcon = createKidIcon("did-not-work");

// Present mode
export const PresentIcon = createKidIcon("present");
export const ArrowNextIcon = createKidIcon("arrow-next");

/** Every icon by its spec name, e.g. `kidIcons["what-helps"]`. */
export const kidIcons: Record<KidIconName, KidIcon> = {
  children: ChildrenIcon,
  "observe-add": ObserveAddIcon,
  timeline: TimelineIcon,
  development: DevelopmentIcon,
  content: ContentIcon,
  account: AccountIcon,
  users: UsersIcon,
  classes: ClassesIcon,
  "parent-home": ParentHomeIcon,
  story: StoryIcon,
  video: VideoIcon,
  game: GameIcon,
  activity: ActivityIcon,
  pack: PackIcon,
  "strength-builder": StrengthBuilderIcon,
  "growth-support": GrowthSupportIcon,
  strengths: StrengthsIcon,
  interests: InterestsIcon,
  "what-helps": WhatHelpsIcon,
  "current-focus": CurrentFocusIcon,
  attention: AttentionIcon,
  "note-quote": NoteQuoteIcon,
  "worked-well": WorkedWellIcon,
  partly: PartlyIcon,
  "did-not-work": DidNotWorkIcon,
  present: PresentIcon,
  "arrow-next": ArrowNextIcon,
};

import type { ContentStatus } from "@prisma/client";
import type { Tone } from "@/components/ui/badge";

export const STATUS_TONE: Record<ContentStatus, Tone> = {
  DRAFT: "amber",
  TEACHER_REVIEW: "violet",
  APPROVED: "sky",
  PUBLISHED: "green",
  ARCHIVED: "stone",
};

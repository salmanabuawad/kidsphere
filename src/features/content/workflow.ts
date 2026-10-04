/**
 * Human approval gate for AI and teacher content.
 *
 *   DRAFT → TEACHER_REVIEW → APPROVED → PUBLISHED → ARCHIVED
 *
 * Only PUBLISHED content is ever visible to a child. Any edit or regeneration
 * returns the item to DRAFT so it must be re-approved before a child sees it.
 */
import type { ContentStatus } from "@prisma/client";
import { AppError } from "@/lib/errors";

export type ContentAction = "submit_review" | "approve" | "publish" | "archive" | "edit";

const ALLOWED: Record<ContentAction, ContentStatus[]> = {
  submit_review: ["DRAFT"],
  // A teacher reviewing their own draft may approve directly; the review step is recorded too.
  approve: ["DRAFT", "TEACHER_REVIEW"],
  publish: ["APPROVED"],
  archive: ["DRAFT", "TEACHER_REVIEW", "APPROVED", "PUBLISHED"],
  edit: ["DRAFT", "TEACHER_REVIEW", "APPROVED", "PUBLISHED"],
};

const TARGET: Record<ContentAction, ContentStatus> = {
  submit_review: "TEACHER_REVIEW",
  approve: "APPROVED",
  publish: "PUBLISHED",
  archive: "ARCHIVED",
  edit: "DRAFT",
};

export function canTransition(from: ContentStatus, action: ContentAction): boolean {
  return ALLOWED[action].includes(from);
}

export function nextContentStatus(from: ContentStatus, action: ContentAction): ContentStatus {
  if (!canTransition(from, action)) {
    const message =
      action === "publish"
        ? "Only approved content can be published. Review and approve it first."
        : `This action is not allowed while the content is ${from.toLowerCase().replace("_", " ")}.`;
    throw new AppError("INVALID_TRANSITION", message, { from, action });
  }
  return TARGET[action];
}

/** The single rule deciding whether a child may ever see a content item. */
export function isVisibleToChild(status: ContentStatus): boolean {
  return status === "PUBLISHED";
}

import type { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { db, type Tx } from "@/lib/db";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_reset_requested"
  | "auth.password_reset"
  | "user.create"
  | "user.update"
  | "user.role_change"
  | "organization.create"
  | "organization.update"
  | "kindergarten.create"
  | "kindergarten.update"
  | "class.create"
  | "class.update"
  | "class.teacher_assign"
  | "class.teacher_unassign"
  | "child.create"
  | "child.update"
  | "child.archive"
  | "parent_child.link"
  | "parent_child.unlink"
  | "questionnaire.save"
  | "questionnaire.submit"
  | "questionnaire.sensitive_view"
  | "parent_message.create"
  | "observation.create"
  | "profile_attribute.confirm"
  | "profile_attribute.retire"
  | "profile_attribute.reject"
  | "goal.create"
  | "goal.update"
  | "goal.close"
  | "content.generate"
  | "content.regenerate"
  | "content.edit"
  | "content.submit_review"
  | "content.approve"
  | "content.publish"
  | "content.archive"
  | "content.return_to_draft"
  | "content.publish_blocked"
  | "outcome.record"
  | "weekly_plan.create"
  | "media.upload"
  | "media.delete"
  | "consent.create"
  | "consent.revoke"
  | "narration.upload"
  | "narration.delete"
  | "child_mode.launch"
  | "child_mode.exit"
  | "child_mode.pin_failed"
  | "template.create"
  | "template.update"
  | "settings.update";

/** Primitive-only metadata. Never put free-text child data in here. */
export type AuditMetadata = Record<string, string | number | boolean | null | string[]>;

export async function audit(
  actor: Pick<Actor, "userId" | "role" | "organizationId"> | null,
  action: AuditAction,
  objectType: string,
  objectId: string | null,
  metadata?: AuditMetadata,
  client: Tx | typeof db = db,
) {
  await client.auditLog.create({
    data: {
      organizationId: actor?.organizationId ?? null,
      actorId: actor?.userId ?? null,
      actorRole: actor?.role ?? null,
      action,
      objectType,
      objectId,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

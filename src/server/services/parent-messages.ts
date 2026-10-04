import type { Actor } from "@/lib/auth/actor";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { authorizeChild } from "@/lib/permissions";
import { notifyChildTeachers } from "./notifications";

/** Parent → teacher update ("Sami slept badly last night"). */
export async function sendParentMessage(actor: Actor, childId: string, body: string) {
  const child = await authorizeChild(db, actor, childId, "parentContribute");
  return db.$transaction(async (tx) => {
    const msg = await tx.parentMessage.create({ data: { organizationId: child.organizationId, childId, authorId: actor.userId, body } });
    await notifyChildTeachers(tx, childId, {
      organizationId: child.organizationId,
      type: "parent_message",
      title: "parent_message",
      link: `/teacher/children/${childId}/parent`,
    });
    await audit(actor, "parent_message.create", "ParentMessage", msg.id, { childId }, tx);
    return msg;
  });
}

export async function listParentMessages(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "view");
  const where = actor.role === "PARENT" ? { childId: child.id, authorId: actor.userId } : { childId: child.id };
  const messages = await db.parentMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
  if (actor.role === "TEACHER") {
    await db.parentMessage.updateMany({ where: { childId: child.id, readAt: null }, data: { readAt: new Date() } });
  }
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(messages.map((m) => m.authorId))] } }, select: { id: true, name: true } });
  return messages.map((m) => ({ ...m, authorName: authors.find((a) => a.id === m.authorId)?.name ?? "" }));
}

import type { Actor } from "@/lib/auth/actor";
import { db, type Tx } from "@/lib/db";

type NotifyInput = { organizationId: string; type: string; title: string; body?: string | null; link?: string | null };

/** Notify every teacher assigned to the child's class. Titles must not contain sensitive details. */
export async function notifyChildTeachers(client: Tx | typeof db, childId: string, n: NotifyInput) {
  const child = await client.child.findUnique({
    where: { id: childId },
    select: { class: { select: { teachers: { select: { userId: true } } } } },
  });
  const userIds = child?.class?.teachers.map((t) => t.userId) ?? [];
  if (userIds.length === 0) return;
  await client.notification.createMany({ data: userIds.map((userId) => ({ ...n, userId })) });
}

export async function notifyChildParents(client: Tx | typeof db, childId: string, n: NotifyInput) {
  const links = await client.parentChild.findMany({ where: { childId }, select: { parentId: true } });
  if (links.length === 0) return;
  await client.notification.createMany({ data: links.map((l) => ({ ...n, userId: l.parentId })) });
}

export async function listNotifications(actor: Actor) {
  return db.notification.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: "desc" }, take: 30 });
}

export async function markNotificationsRead(actor: Actor) {
  await db.notification.updateMany({ where: { userId: actor.userId, readAt: null }, data: { readAt: new Date() } });
}

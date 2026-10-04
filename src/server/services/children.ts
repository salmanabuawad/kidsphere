import type { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { authorizeChild, childScopeWhere, classScopeWhere } from "@/lib/permissions";
import { addDays } from "@/lib/utils";
import type { createChildSchema, updateChildSchema } from "@/server/validators";

export async function listClasses(actor: Actor) {
  return db.class.findMany({
    where: classScopeWhere(actor),
    include: {
      kindergarten: { select: { id: true, name: true } },
      _count: { select: { children: { where: { archivedAt: null } } } },
      teachers: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getClass(actor: Actor, classId: string) {
  const cls = await db.class.findFirst({
    where: { AND: [{ id: classId }, classScopeWhere(actor)] },
    include: { kindergarten: { select: { id: true, name: true } } },
  });
  if (!cls) throw notFound("Class");
  return cls;
}

/** Children of a class with the light-weight summary used by child cards. */
export async function listClassChildren(actor: Actor, classId: string) {
  await getClass(actor, classId);
  const since = addDays(new Date(), -14);
  const children = await db.child.findMany({
    where: { AND: [{ classId, archivedAt: null }, childScopeWhere(actor)] },
    orderBy: { firstName: "asc" },
    include: {
      attributes: {
        where: { status: { in: ["ACTIVE", "PENDING_CONFIRMATION"] }, category: { in: ["STRENGTH", "INTEREST"] } },
        select: { category: true, value: true, status: true },
      },
      goals: { where: { status: "ACTIVE" }, select: { id: true, statement: true, reviewDate: true } },
      observations: { where: { observedAt: { gte: since } }, select: { id: true }, take: 1 },
      _count: { select: { attributes: { where: { status: "PENDING_CONFIRMATION" } } } },
    },
  });
  return children.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    displayName: c.displayName,
    dateOfBirth: c.dateOfBirth,
    avatarColor: c.avatarColor,
    primaryLanguage: c.primaryLanguage,
    strengths: c.attributes.filter((a) => a.category === "STRENGTH" && a.status === "ACTIVE").map((a) => a.value),
    interests: c.attributes.filter((a) => a.category === "INTEREST" && a.status === "ACTIVE").map((a) => a.value),
    activeGoals: c.goals,
    observedRecently: c.observations.length > 0,
    pendingCount: c._count.attributes,
  }));
}

export async function getChild(actor: Actor, childId: string) {
  const child = await authorizeChild(db, actor, childId, "view");
  const cls = child.classId ? await db.class.findUnique({ where: { id: child.classId }, select: { id: true, name: true, kindergartenId: true } }) : null;
  return { ...child, class: cls };
}

async function assertPlacement(actor: Actor, kindergartenId: string, classId: string | null | undefined) {
  const kg = await db.kindergarten.findUnique({ where: { id: kindergartenId } });
  if (!kg) throw notFound("Kindergarten");
  if (actor.role !== "SUPER_ADMIN" && kg.organizationId !== actor.organizationId) throw notFound("Kindergarten");
  if (actor.role === "KINDERGARTEN_ADMIN" && actor.kindergartenId !== kg.id) throw new AppError("FORBIDDEN");
  if (classId) {
    const cls = await db.class.findFirst({ where: { id: classId, kindergartenId: kg.id } });
    if (!cls) throw new AppError("VALIDATION", "Class does not belong to this kindergarten");
  }
  return kg;
}

const COLORS = ["#f59e0b", "#10b981", "#6366f1", "#ec4899", "#0ea5e9", "#84cc16", "#f97316", "#8b5cf6"];

export async function createChild(actor: Actor, input: z.infer<typeof createChildSchema>) {
  if (!["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN"].includes(actor.role)) throw new AppError("FORBIDDEN");
  const kg = await assertPlacement(actor, input.kindergartenId, input.classId);
  return db.$transaction(async (tx) => {
    const child = await tx.child.create({
      data: {
        organizationId: kg.organizationId,
        kindergartenId: kg.id,
        classId: input.classId ?? null,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName ?? input.firstName,
        dateOfBirth: input.dateOfBirth,
        primaryLanguage: input.primaryLanguage,
        otherLanguages: input.otherLanguages,
        avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      },
    });
    await audit({ ...actor, organizationId: kg.organizationId }, "child.create", "Child", child.id, { kindergartenId: kg.id, classId: child.classId }, tx);
    return child;
  });
}

export async function updateChild(actor: Actor, childId: string, input: z.infer<typeof updateChildSchema>) {
  const child = await authorizeChild(db, actor, childId, "manage");
  if (input.kindergartenId || input.classId !== undefined) {
    await assertPlacement(actor, input.kindergartenId ?? child.kindergartenId, input.classId);
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.child.update({
      where: { id: child.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        dateOfBirth: input.dateOfBirth,
        primaryLanguage: input.primaryLanguage,
        otherLanguages: input.otherLanguages,
        kindergartenId: input.kindergartenId,
        classId: input.classId,
      },
    });
    await audit(actor, "child.update", "Child", child.id, { fields: Object.keys(input) }, tx);
    return updated;
  });
}

/** Children linked to the signed-in parent. */
export async function listParentChildren(actor: Actor) {
  if (actor.role !== "PARENT") throw new AppError("FORBIDDEN");
  return db.child.findMany({
    where: { AND: [{ archivedAt: null }, childScopeWhere(actor)] },
    include: { class: { select: { name: true } }, kindergarten: { select: { name: true } } },
    orderBy: { firstName: "asc" },
  });
}

import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { ADMIN_ROLES, type Actor } from "@/lib/auth/actor";
import { hashPassword } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { assertRoleCanManageRole, orgScope } from "@/lib/permissions";
import { contentBodySchema } from "@/lib/ai/schemas";
import type {
  assignTeacherSchema,
  auditQuerySchema,
  classSchema,
  createUserSchema,
  kindergartenSchema,
  linkParentSchema,
  orgSchema,
  orgSettingsSchema,
  templateSchema,
  updateUserSchema,
} from "@/server/validators";

function requireAdmin(actor: Actor) {
  if (!ADMIN_ROLES.includes(actor.role)) throw new AppError("FORBIDDEN");
}

function requireOrgAdmin(actor: Actor) {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "ORGANIZATION_ADMIN") throw new AppError("FORBIDDEN");
}

/** Resolve which org an admin operation targets; non-super admins are pinned to their own. */
function targetOrg(actor: Actor, requested?: string | null): string {
  if (actor.role === "SUPER_ADMIN") {
    if (!requested) throw new AppError("VALIDATION", "Choose an organization");
    return requested;
  }
  if (!actor.organizationId) throw new AppError("FORBIDDEN");
  return actor.organizationId;
}

// ── Organizations ──
export async function listOrganizations(actor: Actor) {
  requireAdmin(actor);
  return db.organization.findMany({
    where: actor.role === "SUPER_ADMIN" ? {} : { id: actor.organizationId ?? "__none__" },
    include: { _count: { select: { kindergartens: true, children: true, users: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createOrganization(actor: Actor, input: z.infer<typeof orgSchema>) {
  if (actor.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN");
  const org = await db.organization.create({ data: input });
  await audit(actor, "organization.create", "Organization", org.id, { slug: org.slug });
  return org;
}

export async function updateOrganizationSettings(actor: Actor, orgId: string, input: z.infer<typeof orgSettingsSchema>) {
  requireOrgAdmin(actor);
  const id = targetOrg(actor, orgId);
  if (actor.role !== "SUPER_ADMIN" && id !== orgId) throw notFound("Organization");
  if (input.defaultLocale && input.enabledLocales && !input.enabledLocales.includes(input.defaultLocale)) {
    throw new AppError("VALIDATION", "The default language must be enabled.");
  }
  const org = await db.organization.update({ where: { id }, data: input });
  await audit({ ...actor, organizationId: id }, "settings.update", "Organization", id, { fields: Object.keys(input) });
  return org;
}

// ── Kindergartens ──
export async function listKindergartens(actor: Actor) {
  requireAdmin(actor);
  const orgId = orgScope(actor);
  return db.kindergarten.findMany({
    where: {
      ...(orgId ? { organizationId: orgId } : {}),
      ...(actor.role === "KINDERGARTEN_ADMIN" ? { id: actor.kindergartenId ?? "__none__" } : {}),
    },
    include: { organization: { select: { name: true } }, _count: { select: { classes: true, children: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createKindergarten(actor: Actor, input: z.infer<typeof kindergartenSchema>) {
  requireOrgAdmin(actor);
  const organizationId = targetOrg(actor, input.organizationId);
  const kg = await db.kindergarten.create({ data: { organizationId, name: input.name, slug: input.slug, address: input.address } });
  await audit({ ...actor, organizationId }, "kindergarten.create", "Kindergarten", kg.id, { slug: kg.slug });
  return kg;
}

// ── Classes ──
async function loadKindergarten(actor: Actor, kindergartenId: string) {
  const kg = await db.kindergarten.findUnique({ where: { id: kindergartenId } });
  if (!kg || (actor.role !== "SUPER_ADMIN" && kg.organizationId !== actor.organizationId)) throw notFound("Kindergarten");
  if (actor.role === "KINDERGARTEN_ADMIN" && actor.kindergartenId !== kg.id) throw notFound("Kindergarten");
  return kg;
}

export async function listAdminClasses(actor: Actor) {
  requireAdmin(actor);
  const orgId = orgScope(actor);
  return db.class.findMany({
    where: {
      ...(orgId ? { organizationId: orgId } : {}),
      ...(actor.role === "KINDERGARTEN_ADMIN" ? { kindergartenId: actor.kindergartenId ?? "__none__" } : {}),
    },
    include: {
      kindergarten: { select: { name: true } },
      teachers: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { children: true } },
    },
    orderBy: [{ kindergartenId: "asc" }, { name: "asc" }],
  });
}

export async function createClass(actor: Actor, input: z.infer<typeof classSchema>) {
  requireAdmin(actor);
  const kg = await loadKindergarten(actor, input.kindergartenId);
  const cls = await db.class.create({
    data: { organizationId: kg.organizationId, kindergartenId: kg.id, name: input.name, ageBand: input.ageBand, contentLocale: input.contentLocale },
  });
  await audit({ ...actor, organizationId: kg.organizationId }, "class.create", "Class", cls.id, { kindergartenId: kg.id });
  return cls;
}

// ── Users ──
export async function listUsers(actor: Actor) {
  requireAdmin(actor);
  const orgId = orgScope(actor);
  const users = await db.user.findMany({
    where: {
      ...(orgId ? { organizationId: orgId } : {}),
      ...(actor.role === "KINDERGARTEN_ADMIN"
        ? {
            OR: [
              { kindergartenId: actor.kindergartenId ?? "__none__" },
              { classes: { some: { class: { kindergartenId: actor.kindergartenId ?? "__none__" } } } },
              { children: { some: { child: { kindergartenId: actor.kindergartenId ?? "__none__" } } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      uiLocale: true,
      organizationId: true,
      kindergartenId: true,
      lastLoginAt: true,
      classes: { select: { classId: true } },
      children: { select: { childId: true, relation: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return users;
}

export async function createUser(actor: Actor, input: z.infer<typeof createUserSchema>) {
  requireAdmin(actor);
  assertRoleCanManageRole(actor, input.role);
  const organizationId = input.role === "SUPER_ADMIN" ? null : targetOrg(actor, input.organizationId);
  let kindergartenId = input.kindergartenId ?? null;
  if (actor.role === "KINDERGARTEN_ADMIN") kindergartenId = actor.kindergartenId;
  if (kindergartenId) await loadKindergarten(actor, kindergartenId);
  if (input.role === "KINDERGARTEN_ADMIN" && !kindergartenId) throw new AppError("VALIDATION", "A kindergarten admin needs a kindergarten.");

  const user = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      organizationId,
      kindergartenId,
      uiLocale: input.uiLocale,
    },
    select: { id: true, email: true, name: true, role: true },
  });
  await audit({ ...actor, organizationId: organizationId ?? actor.organizationId }, "user.create", "User", user.id, { role: user.role });
  return user;
}

async function loadManagedUser(actor: Actor, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User");
  if (actor.role !== "SUPER_ADMIN" && user.organizationId !== actor.organizationId) throw notFound("User");
  assertRoleCanManageRole(actor, user.role);
  return user;
}

export async function updateUser(actor: Actor, userId: string, input: z.infer<typeof updateUserSchema>) {
  requireAdmin(actor);
  if (userId === actor.userId && (input.role || input.isActive === false)) {
    throw new AppError("FORBIDDEN", "You cannot change your own role or deactivate yourself.");
  }
  const user = await loadManagedUser(actor, userId);
  if (input.role) assertRoleCanManageRole(actor, input.role);
  if (input.kindergartenId) await loadKindergarten(actor, input.kindergartenId);
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: user.id },
      data: { name: input.name, role: input.role, isActive: input.isActive, kindergartenId: input.kindergartenId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (input.isActive === false || (input.role && input.role !== user.role)) {
      await tx.session.deleteMany({ where: { userId: user.id } });
    }
    if (input.role && input.role !== user.role) {
      await audit(actor, "user.role_change", "User", user.id, { from: user.role, to: input.role }, tx);
    } else {
      await audit(actor, "user.update", "User", user.id, { fields: Object.keys(input) }, tx);
    }
    return u;
  });
  return updated;
}

// ── Assignments ──
export async function assignTeacher(actor: Actor, input: z.infer<typeof assignTeacherSchema>) {
  requireAdmin(actor);
  const cls = await db.class.findUnique({ where: { id: input.classId } });
  if (!cls) throw notFound("Class");
  await loadKindergarten(actor, cls.kindergartenId);
  const teacher = await loadManagedUser(actor, input.userId);
  if (teacher.role !== "TEACHER") throw new AppError("VALIDATION", "Only teachers can be assigned to classes.");
  if (teacher.organizationId !== cls.organizationId) throw notFound("User");
  if (input.assign) {
    await db.classTeacher.upsert({
      where: { classId_userId: { classId: cls.id, userId: teacher.id } },
      create: { classId: cls.id, userId: teacher.id, organizationId: cls.organizationId },
      update: {},
    });
  } else {
    await db.classTeacher.deleteMany({ where: { classId: cls.id, userId: teacher.id } });
  }
  await audit(actor, input.assign ? "class.teacher_assign" : "class.teacher_unassign", "Class", cls.id, { teacherId: teacher.id });
}

export async function linkParent(actor: Actor, input: z.infer<typeof linkParentSchema>) {
  requireAdmin(actor);
  const child = await db.child.findUnique({ where: { id: input.childId } });
  if (!child) throw notFound("Child");
  await loadKindergarten(actor, child.kindergartenId);
  const parent = await loadManagedUser(actor, input.parentId);
  if (parent.role !== "PARENT") throw new AppError("VALIDATION", "Only parent accounts can be linked to children.");
  if (parent.organizationId !== child.organizationId) throw notFound("User");
  if (input.link) {
    await db.parentChild.upsert({
      where: { parentId_childId: { parentId: parent.id, childId: child.id } },
      create: { parentId: parent.id, childId: child.id, organizationId: child.organizationId, relation: input.relation },
      update: { relation: input.relation },
    });
  } else {
    await db.parentChild.deleteMany({ where: { parentId: parent.id, childId: child.id } });
  }
  await audit(actor, input.link ? "parent_child.link" : "parent_child.unlink", "Child", child.id, { parentId: parent.id });
}

export async function listAdminChildren(actor: Actor) {
  requireAdmin(actor);
  const orgId = orgScope(actor);
  return db.child.findMany({
    where: {
      archivedAt: null,
      ...(orgId ? { organizationId: orgId } : {}),
      ...(actor.role === "KINDERGARTEN_ADMIN" ? { kindergartenId: actor.kindergartenId ?? "__none__" } : {}),
    },
    include: {
      class: { select: { id: true, name: true } },
      kindergarten: { select: { id: true, name: true } },
      parents: { include: { parent: { select: { id: true, name: true, email: true } } } },
    },
    orderBy: { firstName: "asc" },
  });
}

// ── Templates ──
export async function listTemplates(actor: Actor) {
  requireAdmin(actor);
  const orgId = orgScope(actor);
  return db.contentTemplate.findMany({
    where: orgId ? { OR: [{ organizationId: orgId }, { organizationId: null }] } : {},
    orderBy: [{ isActive: "desc" }, { title: "asc" }],
  });
}

export async function upsertTemplate(actor: Actor, id: string | null, input: z.infer<typeof templateSchema>) {
  requireAdmin(actor);
  const body = contentBodySchema.safeParse(input.body);
  if (!body.success)
    throw new AppError("VALIDATION", "Template body is not valid content JSON.", { issues: body.error.issues.slice(0, 5).map((i) => i.message) });
  const organizationId = actor.role === "SUPER_ADMIN" ? null : actor.organizationId;
  const data = {
    title: input.title,
    type: input.type,
    language: input.language,
    description: input.description,
    domain: input.domain ?? null,
    ageBand: input.ageBand,
    body: body.data as unknown as Prisma.InputJsonValue,
    isActive: input.isActive,
  };
  if (id) {
    const existing = await db.contentTemplate.findUnique({ where: { id } });
    if (!existing || (actor.role !== "SUPER_ADMIN" && existing.organizationId !== actor.organizationId)) throw notFound("Template");
    const t = await db.contentTemplate.update({ where: { id }, data });
    await audit(actor, "template.update", "ContentTemplate", id, {});
    return t;
  }
  const t = await db.contentTemplate.create({ data: { ...data, organizationId, createdById: actor.userId } });
  await audit(actor, "template.create", "ContentTemplate", t.id, {});
  return t;
}

// ── Audit ──
export async function queryAudit(actor: Actor, q: z.infer<typeof auditQuerySchema>) {
  requireAdmin(actor);
  const orgId = orgScope(actor);
  const where: Prisma.AuditLogWhereInput = {
    ...(orgId ? { organizationId: orgId } : {}),
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.objectType ? { objectType: q.objectType } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
  };
  const pageSize = 50;
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * pageSize, take: pageSize }),
  ]);
  const actors = await db.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))] } },
    select: { id: true, name: true, email: true },
  });
  return {
    total,
    page: q.page,
    pageSize,
    rows: rows.map((r) => ({ ...r, actor: actors.find((a) => a.id === r.actorId) ?? null })),
  };
}

export async function aiLogSummary(actor: Actor) {
  requireAdmin(actor);
  const orgId = orgScope(actor);
  return db.aIRequestLog.findMany({ where: orgId ? { organizationId: orgId } : {}, orderBy: { createdAt: "desc" }, take: 25 });
}

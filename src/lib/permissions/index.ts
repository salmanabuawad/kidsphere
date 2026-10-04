/**
 * Central, server-side authorization.
 *
 * Every service resolves access through these helpers — there is no other
 * place that decides who may see a child. Lookups are always combined with the
 * actor's tenant scope in the *same query*, so an ID from another tenant is
 * indistinguishable from an ID that does not exist (404, not 403).
 */
import type { Child, Prisma, Role } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import type { Db, Tx } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";

export type ChildAction =
  /** Basic profile, strengths, published content. */
  | "view"
  /** Observations, provenance, internal profile, parent answers. */
  | "viewInternal"
  /** Protected health answers. */
  | "viewSensitive"
  /** Create observations, confirm/retire attributes. */
  | "observe"
  /** Goals, content generation, approval, outcomes. */
  | "plan"
  /** Questionnaire, media upload, consent, messages to teacher. */
  | "parentContribute"
  /** Edit the child record and assignments. */
  | "manage";

const ACTION_ROLES: Record<ChildAction, Role[]> = {
  view: ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN", "TEACHER", "PARENT"],
  viewInternal: ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN", "TEACHER"],
  viewSensitive: ["KINDERGARTEN_ADMIN", "TEACHER"],
  observe: ["TEACHER"],
  plan: ["TEACHER"],
  parentContribute: ["PARENT"],
  manage: ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN"],
};

export function canPerform(role: Role, action: ChildAction): boolean {
  return ACTION_ROLES[action].includes(role);
}

/** Prisma filter restricting children to those the actor may access at all. */
export function childScopeWhere(actor: Actor): Prisma.ChildWhereInput {
  switch (actor.role) {
    case "SUPER_ADMIN":
      return {};
    case "ORGANIZATION_ADMIN":
      return { organizationId: requireOrg(actor) };
    case "KINDERGARTEN_ADMIN":
      return { organizationId: requireOrg(actor), kindergartenId: actor.kindergartenId ?? "__none__" };
    case "TEACHER":
      return {
        organizationId: requireOrg(actor),
        class: { teachers: { some: { userId: actor.userId } } },
      };
    case "PARENT":
      return { organizationId: requireOrg(actor), parents: { some: { parentId: actor.userId } } };
  }
}

export function classScopeWhere(actor: Actor): Prisma.ClassWhereInput {
  switch (actor.role) {
    case "SUPER_ADMIN":
      return {};
    case "ORGANIZATION_ADMIN":
      return { organizationId: requireOrg(actor) };
    case "KINDERGARTEN_ADMIN":
      return { organizationId: requireOrg(actor), kindergartenId: actor.kindergartenId ?? "__none__" };
    case "TEACHER":
      return { organizationId: requireOrg(actor), teachers: { some: { userId: actor.userId } } };
    case "PARENT":
      return { organizationId: requireOrg(actor), children: { some: { parents: { some: { parentId: actor.userId } } } } };
  }
}

function requireOrg(actor: Actor): string {
  if (!actor.organizationId) throw new AppError("FORBIDDEN", "Account is not attached to an organization");
  return actor.organizationId;
}

/** Load a child the actor may perform `action` on, or throw 404/403. */
export async function authorizeChild(client: Db | Tx, actor: Actor, childId: string, action: ChildAction): Promise<Child> {
  const child = await client.child.findFirst({
    where: { AND: [{ id: childId, archivedAt: null }, childScopeWhere(actor)] },
  });
  if (!child) throw notFound("Child");
  if (!canPerform(actor.role, action)) throw new AppError("FORBIDDEN");
  return child;
}

export async function authorizeGoal(client: Db | Tx, actor: Actor, goalId: string, action: ChildAction) {
  const goal = await client.goal.findFirst({
    where: { id: goalId, child: childScopeWhere(actor) },
  });
  if (!goal) throw notFound("Goal");
  const child = await authorizeChild(client, actor, goal.childId, action);
  return { goal, child };
}

export type ContentAction = "view" | "edit" | "approve" | "publish";

/**
 * Content belongs either to a child (personalized) or to a class / the
 * organization (shared). Parents may only ever see PUBLISHED content of their
 * own child; staff authoring requires the `plan` permission on the child.
 */
export async function authorizeContent(client: Db | Tx, actor: Actor, contentId: string, action: ContentAction) {
  const content = await client.contentAsset.findUnique({ where: { id: contentId } });
  if (!content) throw notFound("Content");
  if (actor.role !== "SUPER_ADMIN" && content.organizationId !== actor.organizationId) throw notFound("Content");

  if (content.childId) {
    const childAction: ChildAction = action === "view" ? "view" : "plan";
    await authorizeChild(client, actor, content.childId, childAction);
  } else if (content.classId) {
    const cls = await client.class.findFirst({ where: { AND: [{ id: content.classId }, classScopeWhere(actor)] } });
    if (!cls) throw notFound("Content");
    if (action !== "view" && actor.role !== "TEACHER") throw new AppError("FORBIDDEN");
  } else if (action !== "view" && actor.role !== "TEACHER") {
    throw new AppError("FORBIDDEN");
  }

  if (actor.role === "PARENT" && content.status !== "PUBLISHED") throw notFound("Content");
  return content;
}

export function assertRoleCanManageRole(actor: Actor, target: Role) {
  const allowed: Record<Role, Role[]> = {
    SUPER_ADMIN: ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN", "TEACHER", "PARENT"],
    ORGANIZATION_ADMIN: ["ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN", "TEACHER", "PARENT"],
    KINDERGARTEN_ADMIN: ["TEACHER", "PARENT"],
    TEACHER: [],
    PARENT: [],
  };
  if (!allowed[actor.role].includes(target)) {
    throw new AppError("FORBIDDEN", "You cannot assign this role");
  }
}

/** Org scope for admin listings. SUPER_ADMIN may pass an explicit org. */
export function orgScope(actor: Actor, requestedOrgId?: string | null): string | undefined {
  if (actor.role === "SUPER_ADMIN") return requestedOrgId ?? undefined;
  return requireOrg(actor);
}

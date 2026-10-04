import type { Role, User } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db";

/** Wipe every application table in the test database (never run against dev/prod). */
export async function resetDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/ks_test|_test|e2e/.test(url)) throw new Error(`Refusing to truncate non-test database: ${url}`);
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export function actorOf(u: Pick<User, "id" | "role" | "organizationId" | "kindergartenId" | "name" | "email">): Actor {
  return { userId: u.id, role: u.role, organizationId: u.organizationId, kindergartenId: u.kindergartenId, name: u.name, email: u.email, uiLocale: "en" };
}

let counter = 0;

/** A complete tenant: org → kindergarten → class → teacher, parent, child (+ admins). */
export async function makeTenant(label = "a") {
  const n = `${label}${++counter}`;
  const org = await db.organization.create({ data: { name: `Org ${n}`, slug: `org-${n}` } });
  const kg = await db.kindergarten.create({ data: { organizationId: org.id, name: `KG ${n}`, slug: `kg-${n}` } });
  const otherKg = await db.kindergarten.create({ data: { organizationId: org.id, name: `KG2 ${n}`, slug: `kg2-${n}` } });
  const cls = await db.class.create({ data: { organizationId: org.id, kindergartenId: kg.id, name: `Class ${n}` } });
  const otherCls = await db.class.create({ data: { organizationId: org.id, kindergartenId: otherKg.id, name: `Other ${n}` } });

  const user = (role: Role, kindergartenId: string | null = null) =>
    db.user.create({
      data: {
        email: `${role.toLowerCase()}-${n}-${Math.random().toString(36).slice(2, 7)}@t.local`,
        name: `${role} ${n}`,
        role,
        organizationId: org.id,
        kindergartenId,
        passwordHash: "x",
      },
    });

  const teacher = await user("TEACHER", kg.id);
  const otherTeacher = await user("TEACHER", otherKg.id);
  const parent = await user("PARENT");
  const otherParent = await user("PARENT");
  const orgAdmin = await user("ORGANIZATION_ADMIN");
  const kgAdmin = await user("KINDERGARTEN_ADMIN", kg.id);
  await db.classTeacher.createMany({
    data: [
      { classId: cls.id, userId: teacher.id, organizationId: org.id },
      { classId: otherCls.id, userId: otherTeacher.id, organizationId: org.id },
    ],
  });

  const child = await db.child.create({
    data: {
      organizationId: org.id,
      kindergartenId: kg.id,
      classId: cls.id,
      firstName: "Adam",
      lastName: "Haddad",
      displayName: "Adam",
      dateOfBirth: new Date(Date.now() - 4.3 * 365 * 86_400_000),
      primaryLanguage: "ar",
    },
  });
  const otherChild = await db.child.create({
    data: {
      organizationId: org.id,
      kindergartenId: otherKg.id,
      classId: otherCls.id,
      firstName: "Omar",
      displayName: "Omar",
      dateOfBirth: new Date(Date.now() - 4 * 365 * 86_400_000),
    },
  });
  await db.parentChild.createMany({
    data: [
      { parentId: parent.id, childId: child.id, organizationId: org.id },
      { parentId: otherParent.id, childId: otherChild.id, organizationId: org.id },
    ],
  });

  return {
    org,
    kg,
    cls,
    child,
    otherChild,
    teacher: actorOf(teacher),
    otherTeacher: actorOf(otherTeacher),
    parent: actorOf(parent),
    otherParent: actorOf(otherParent),
    orgAdmin: actorOf(orgAdmin),
    kgAdmin: actorOf(kgAdmin),
  };
}

export const TRANSITION_GOAL = {
  domain: "ATTENTION_EF" as const,
  statement: "Move from a preferred activity to group time after one reminder and a visual cue.",
  successIndicator: "Successful in at least 3 of 5 observed opportunities.",
  startDate: new Date(),
  reviewDate: new Date(Date.now() + 21 * 86_400_000),
  parentReinforcement: null,
  parentFocus: null,
  shareWithParent: false,
  evidenceAttributeIds: [] as string[],
};

/** Minimal valid PNG (1×1). */
export const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082",
  "hex",
);

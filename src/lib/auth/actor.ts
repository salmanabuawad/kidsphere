import type { Locale, Role } from "@prisma/client";

/** The authenticated adult performing a request. Built only on the server. */
export type Actor = {
  userId: string;
  role: Role;
  organizationId: string | null;
  kindergartenId: string | null;
  name: string;
  email: string;
  uiLocale: Locale;
};

export const ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN"];
export const STAFF_ROLES: Role[] = [...ADMIN_ROLES, "TEACHER"];

/** Ordered privilege — used to stop admins granting roles above their own. */
export const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 100,
  ORGANIZATION_ADMIN: 80,
  KINDERGARTEN_ADMIN: 60,
  TEACHER: 40,
  PARENT: 20,
};

export function homePathFor(role: Role): string {
  switch (role) {
    case "TEACHER":
      return "/teacher";
    case "PARENT":
      return "/parent";
    default:
      return "/admin";
  }
}

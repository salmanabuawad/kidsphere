import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { createClass, listAdminClasses } from "@/server/services/admin";
import { classSchema } from "@/server/validators";

export const GET = authed(async (_req, actor) => listAdminClasses(actor), { roles: ADMIN_ROLES });
export const POST = authed(async (req, actor) => createClass(actor, await parseBody(req, classSchema)), { roles: ADMIN_ROLES, status: 201 });

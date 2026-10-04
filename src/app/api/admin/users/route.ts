import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { createUser, listUsers } from "@/server/services/admin";
import { createUserSchema } from "@/server/validators";

export const GET = authed(async (_req, actor) => listUsers(actor), { roles: ADMIN_ROLES });
export const POST = authed(async (req, actor) => createUser(actor, await parseBody(req, createUserSchema)), { roles: ADMIN_ROLES, status: 201 });

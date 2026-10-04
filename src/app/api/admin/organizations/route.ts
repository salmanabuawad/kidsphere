import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { createOrganization, listOrganizations } from "@/server/services/admin";
import { orgSchema } from "@/server/validators";

export const GET = authed(async (_req, actor) => listOrganizations(actor), { roles: ADMIN_ROLES });
export const POST = authed(async (req, actor) => createOrganization(actor, await parseBody(req, orgSchema)), { roles: ["SUPER_ADMIN"], status: 201 });

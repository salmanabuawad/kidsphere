import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { listTemplates, upsertTemplate } from "@/server/services/admin";
import { templateSchema } from "@/server/validators";

export const GET = authed(async (_req, actor) => listTemplates(actor), { roles: ADMIN_ROLES });
export const POST = authed(async (req, actor) => upsertTemplate(actor, null, await parseBody(req, templateSchema)), { roles: ADMIN_ROLES, status: 201 });

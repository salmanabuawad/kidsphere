import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { createKindergarten, listKindergartens } from "@/server/services/admin";
import { kindergartenSchema } from "@/server/validators";

export const GET = authed(async (_req, actor) => listKindergartens(actor), { roles: ADMIN_ROLES });
export const POST = authed(async (req, actor) => createKindergarten(actor, await parseBody(req, kindergartenSchema)), {
  roles: ["SUPER_ADMIN", "ORGANIZATION_ADMIN"],
  status: 201,
});

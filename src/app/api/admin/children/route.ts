import { authed } from "@/lib/route";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { listAdminChildren } from "@/server/services/admin";

export const GET = authed(async (_req, actor) => listAdminChildren(actor), { roles: ADMIN_ROLES });

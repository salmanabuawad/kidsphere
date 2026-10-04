import { authed } from "@/lib/route";
import { parseQuery } from "@/lib/api";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { queryAudit } from "@/server/services/admin";
import { auditQuerySchema } from "@/server/validators";

export const GET = authed(async (req, actor) => queryAudit(actor, parseQuery(req, auditQuerySchema)), { roles: ADMIN_ROLES });

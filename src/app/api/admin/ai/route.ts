import { authed } from "@/lib/route";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { providerStatuses } from "@/lib/ai";
import { aiLogSummary } from "@/server/services/admin";

/** Configuration status only — never returns API keys. */
export const GET = authed(async (_req, actor) => ({ providers: providerStatuses(), recent: await aiLogSummary(actor) }), { roles: ADMIN_ROLES });

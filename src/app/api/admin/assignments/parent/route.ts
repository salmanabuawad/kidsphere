import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { linkParent } from "@/server/services/admin";
import { linkParentSchema } from "@/server/validators";

export const POST = authed(async (req, actor) => linkParent(actor, await parseBody(req, linkParentSchema)), { roles: ADMIN_ROLES });

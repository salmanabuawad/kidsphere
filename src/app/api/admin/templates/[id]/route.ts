import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { upsertTemplate } from "@/server/services/admin";
import { templateSchema } from "@/server/validators";

type P = { id: string };
export const PUT = authed<P>(async (req, actor, { id }) => upsertTemplate(actor, id, await parseBody(req, templateSchema)), { roles: ADMIN_ROLES });

import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { updateUser } from "@/server/services/admin";
import { updateUserSchema } from "@/server/validators";

type P = { id: string };
export const PATCH = authed<P>(async (req, actor, { id }) => updateUser(actor, id, await parseBody(req, updateUserSchema)), { roles: ADMIN_ROLES });

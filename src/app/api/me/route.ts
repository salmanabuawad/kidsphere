import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { updateMe } from "@/server/services/auth";
import { updateMeSchema } from "@/server/validators";

export const GET = authed(async (_req, actor) => ({ id: actor.userId, name: actor.name, email: actor.email, role: actor.role, uiLocale: actor.uiLocale }));
export const PATCH = authed(async (req, actor) => updateMe(actor, await parseBody(req, updateMeSchema)));

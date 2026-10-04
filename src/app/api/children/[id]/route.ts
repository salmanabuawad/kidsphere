import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { getChild, updateChild } from "@/server/services/children";
import { updateChildSchema } from "@/server/validators";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => getChild(actor, id));
export const PATCH = authed<P>(async (req, actor, { id }) => updateChild(actor, id, await parseBody(req, updateChildSchema)));

import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { regenerateContent } from "@/server/services/content";
import { regenerateSchema } from "@/server/validators";

type P = { id: string };
export const POST = authed<P>(async (req, actor, { id }) => regenerateContent(actor, id, await parseBody(req, regenerateSchema)), { roles: ["TEACHER"] });

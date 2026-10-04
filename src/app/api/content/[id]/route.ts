import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { getContent, patchContent } from "@/server/services/content";
import { patchContentSchema } from "@/server/validators";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => getContent(actor, id));
export const PATCH = authed<P>(async (req, actor, { id }) => patchContent(actor, id, await parseBody(req, patchContentSchema)), { roles: ["TEACHER"] });

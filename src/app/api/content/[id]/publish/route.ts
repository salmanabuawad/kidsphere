import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { publishContent } from "@/server/services/content";
import { approvalNoteSchema } from "@/server/validators";

type P = { id: string };
export const POST = authed<P>(async (req, actor, { id }) => publishContent(actor, id, (await parseBody(req, approvalNoteSchema)).note), { roles: ["TEACHER"] });

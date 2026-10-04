import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { listParentMessages, sendParentMessage } from "@/server/services/parent-messages";
import { parentMessageSchema } from "@/server/validators";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => listParentMessages(actor, id));
export const POST = authed<P>(async (req, actor, { id }) => sendParentMessage(actor, id, (await parseBody(req, parentMessageSchema)).body), {
  roles: ["PARENT"],
  status: 201,
});

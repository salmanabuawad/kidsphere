import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { recordOutcome } from "@/server/services/outcomes";
import { outcomeSchema } from "@/server/validators";

type P = { id: string };
export const POST = authed<P>(async (req, actor, { id }) => recordOutcome(actor, id, await parseBody(req, outcomeSchema)), { roles: ["TEACHER"], status: 201 });

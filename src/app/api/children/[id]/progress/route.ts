import { authed } from "@/lib/route";
import { getProgress } from "@/server/services/outcomes";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => getProgress(actor, id));

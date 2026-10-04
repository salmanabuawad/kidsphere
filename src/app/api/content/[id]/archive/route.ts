import { authed } from "@/lib/route";
import { archiveContent } from "@/server/services/content";

type P = { id: string };
export const POST = authed<P>(async (_req, actor, { id }) => archiveContent(actor, id), { roles: ["TEACHER"] });

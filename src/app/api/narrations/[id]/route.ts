import { authed } from "@/lib/route";
import { deleteNarration } from "@/server/services/media";

type P = { id: string };
export const DELETE = authed<P>(async (_req, actor, { id }) => deleteNarration(actor, id), { roles: ["TEACHER"] });

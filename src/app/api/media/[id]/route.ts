import { authed } from "@/lib/route";
import { deleteMedia } from "@/server/services/media";

type P = { id: string };
export const DELETE = authed<P>(async (_req, actor, { id }) => deleteMedia(actor, id), { roles: ["PARENT"] });

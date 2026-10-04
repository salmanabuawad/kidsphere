import { authed } from "@/lib/route";
import { confirmAttribute } from "@/server/services/profile";

type P = { id: string; attributeId: string };
export const POST = authed<P>(async (_req, actor, { id, attributeId }) => confirmAttribute(actor, id, attributeId), { roles: ["TEACHER"] });

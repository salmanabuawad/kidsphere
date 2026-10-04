import { authed } from "@/lib/route";
import { retireAttribute } from "@/server/services/profile";

type P = { id: string; attributeId: string };
export const POST = authed<P>(async (_req, actor, { id, attributeId }) => retireAttribute(actor, id, attributeId), { roles: ["TEACHER"] });

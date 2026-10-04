import { authed } from "@/lib/route";
import { getInternalProfile, getParentProfile } from "@/server/services/profile";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => (actor.role === "PARENT" ? getParentProfile(actor, id) : getInternalProfile(actor, id)));

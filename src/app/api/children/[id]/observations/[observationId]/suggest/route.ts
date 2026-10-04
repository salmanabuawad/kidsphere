import { authed } from "@/lib/route";
import { suggestAttributesFromObservation } from "@/server/services/profile";

type P = { id: string; observationId: string };
export const POST = authed<P>(async (_req, actor, { id, observationId }) => suggestAttributesFromObservation(actor, id, observationId), { roles: ["TEACHER"] });

import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { createObservation, listObservations } from "@/server/services/observations";
import { observationSchema } from "@/server/validators";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => listObservations(actor, id));
export const POST = authed<P>(async (req, actor, { id }) => createObservation(actor, id, await parseBody(req, observationSchema)), {
  roles: ["TEACHER"],
  status: 201,
});

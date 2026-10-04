import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { createGoal, listGoals, listParentGoals } from "@/server/services/goals";
import { createGoalSchema } from "@/server/validators";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => (actor.role === "PARENT" ? listParentGoals(actor, id) : listGoals(actor, id)));
export const POST = authed<P>(async (req, actor, { id }) => createGoal(actor, id, await parseBody(req, createGoalSchema)), { roles: ["TEACHER"], status: 201 });

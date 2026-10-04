import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { updateGoal } from "@/server/services/goals";
import { updateGoalSchema } from "@/server/validators";

type P = { id: string };
export const PATCH = authed<P>(async (req, actor, { id }) => updateGoal(actor, id, await parseBody(req, updateGoalSchema)), { roles: ["TEACHER"] });

import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { updatePlanItem } from "@/server/services/weekly-plans";
import { planItemUpdateSchema } from "@/server/validators";

type P = { id: string };
export const PATCH = authed<P>(async (req, actor, { id }) => updatePlanItem(actor, id, await parseBody(req, planItemUpdateSchema)), { roles: ["TEACHER"] });

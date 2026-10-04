import { z } from "zod";
import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { generatePlanItem } from "@/server/services/weekly-plans";
import { localeSchema } from "@/server/validators";

type P = { id: string };
const schema = z.object({ language: localeSchema.optional() }).strict();
export const POST = authed<P>(async (req, actor, { id }) => generatePlanItem(actor, id, (await parseBody(req, schema)).language), { roles: ["TEACHER"] });

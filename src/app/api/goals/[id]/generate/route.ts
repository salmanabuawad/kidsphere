import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { generateForGoal, getGenerationOptions } from "@/server/services/content";
import { CONTENT_TYPE_VALUES, generateSchema } from "@/server/validators";

type P = { id: string };
/** GET: what Kidsphere proposes to personalize with. POST: generate a DRAFT. */
export const GET = authed<P>(
  async (req, actor, { id }) => {
    const type = new URL(req.url).searchParams.get("type");
    const contentType = CONTENT_TYPE_VALUES.find((t) => t === type) ?? null;
    return getGenerationOptions(actor, id, contentType);
  },
  { roles: ["TEACHER"] },
);
export const POST = authed<P>(async (req, actor, { id }) => generateForGoal(actor, id, await parseBody(req, generateSchema)), {
  roles: ["TEACHER"],
  status: 201,
});

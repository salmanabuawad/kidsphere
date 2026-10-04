import { z } from "zod";
import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { createFromTemplate } from "@/server/services/content";

type P = { id: string };
const schema = z.object({ templateId: z.string().min(1), goalId: z.string().min(1).nullable().optional() }).strict();
export const POST = authed<P>(
  async (req, actor, { id }) => {
    const b = await parseBody(req, schema);
    return createFromTemplate(actor, b.templateId, id, b.goalId ?? null);
  },
  { roles: ["TEACHER"], status: 201 },
);

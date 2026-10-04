import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { addTeacherAttribute } from "@/server/services/profile";
import { manualAttributeSchema } from "@/server/validators";

type P = { id: string };
export const POST = authed<P>(
  async (req, actor, { id }) => {
    const b = await parseBody(req, manualAttributeSchema);
    return addTeacherAttribute(actor, id, b.category, b.value, b.note);
  },
  { roles: ["TEACHER"], status: 201 },
);

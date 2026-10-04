import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { approveContent } from "@/server/services/content";
import { approvalNoteSchema } from "@/server/validators";

type P = { id: string };
export const POST = authed<P>(
  async (req, actor, { id }) => {
    const b = await parseBody(req, approvalNoteSchema);
    return approveContent(actor, id, b.note, b.revision);
  },
  { roles: ["TEACHER"] },
);

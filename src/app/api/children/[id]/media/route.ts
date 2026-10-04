import { authed, readUpload } from "@/lib/route";
import { listMedia, uploadMedia } from "@/server/services/media";
import { mediaMetaSchema } from "@/server/validators";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => listMedia(actor, id));
export const POST = authed<P>(
  async (req, actor, { id }) => {
    const { form, file } = await readUpload(req);
    const meta = mediaMetaSchema.parse({ personRelation: form.get("personRelation"), personLabel: form.get("personLabel") });
    return uploadMedia(actor, id, file, meta);
  },
  { roles: ["PARENT"], status: 201 },
);

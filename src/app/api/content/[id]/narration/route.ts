import { authed, readUpload } from "@/lib/route";
import { uploadNarration } from "@/server/services/media";

type P = { id: string };
export const POST = authed<P>(
  async (req, actor, { id }) => {
    const { form, file } = await readUpload(req);
    const scene = form.get("sceneId");
    return uploadNarration(actor, id, file, typeof scene === "string" && scene ? scene : null);
  },
  { roles: ["TEACHER"], status: 201 },
);

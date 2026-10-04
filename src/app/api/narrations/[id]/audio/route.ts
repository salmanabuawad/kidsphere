import { authed, fileResponse } from "@/lib/route";
import { readNarration } from "@/server/services/media";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => {
  const f = await readNarration({ actor }, id);
  return fileResponse(f.data, f.mimeType);
});

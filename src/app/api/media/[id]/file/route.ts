import { authed, fileResponse } from "@/lib/route";
import { readMediaFile } from "@/server/services/media";

type P = { id: string };
/** Authorized retrieval — storage paths are never exposed; revoked assets return 404/410. */
export const GET = authed<P>(async (_req, actor, { id }) => {
  const f = await readMediaFile({ actor }, id);
  return fileResponse(f.data, f.mimeType);
});

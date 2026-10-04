import { requireChildSession } from "@/lib/child-session";
import { handler } from "@/lib/api";
import { fileResponse } from "@/lib/route";
import { readMediaFile } from "@/server/services/media";

export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const f = await readMediaFile({ child: await requireChildSession() }, (await ctx.params).id);
  return fileResponse(f.data, f.mimeType);
});

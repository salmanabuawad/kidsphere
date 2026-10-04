import { requireChildSession } from "@/lib/child-session";
import { handler } from "@/lib/api";
import { childContentItem } from "@/server/services/child-mode";

export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) =>
  Response.json(await childContentItem(await requireChildSession(), (await ctx.params).id)),
);

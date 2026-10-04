import { requireChildSession } from "@/lib/child-session";
import { handler } from "@/lib/api";
import { childHome } from "@/server/services/child-mode";

export const GET = handler(async () => Response.json(await childHome(await requireChildSession())));

import { authed } from "@/lib/route";
import { listClasses } from "@/server/services/children";

export const GET = authed(async (_req, actor) => listClasses(actor));

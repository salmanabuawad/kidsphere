import { authed } from "@/lib/route";
import { listClassChildren } from "@/server/services/children";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => listClassChildren(actor, id), {
  roles: ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN", "TEACHER"],
});

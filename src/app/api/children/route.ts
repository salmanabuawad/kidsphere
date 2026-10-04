import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { createChild } from "@/server/services/children";
import { createChildSchema } from "@/server/validators";

export const POST = authed(async (req, actor) => createChild(actor, await parseBody(req, createChildSchema)), {
  roles: ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN"],
  status: 201,
});

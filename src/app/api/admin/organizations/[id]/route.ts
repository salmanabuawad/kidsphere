import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { updateOrganizationSettings } from "@/server/services/admin";
import { orgSettingsSchema } from "@/server/validators";

type P = { id: string };
export const PATCH = authed<P>(async (req, actor, { id }) => updateOrganizationSettings(actor, id, await parseBody(req, orgSettingsSchema)), {
  roles: ["SUPER_ADMIN", "ORGANIZATION_ADMIN"],
});

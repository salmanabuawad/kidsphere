import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { revokeConsent } from "@/server/services/media";
import { consentPatchSchema } from "@/server/validators";

type P = { id: string };
export const PATCH = authed<P>(
  async (req, actor, { id }) => {
    await parseBody(req, consentPatchSchema);
    return revokeConsent(actor, id);
  },
  { roles: ["PARENT"] },
);

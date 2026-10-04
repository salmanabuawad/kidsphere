import { open } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { requestPasswordReset } from "@/server/services/auth";
import { forgotSchema } from "@/server/validators";

export const POST = open(async (req) => {
  const { email } = await parseBody(req, forgotSchema);
  await requestPasswordReset(email);
  return { ok: true };
});

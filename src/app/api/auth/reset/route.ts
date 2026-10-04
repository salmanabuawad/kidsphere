import { open } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { resetPassword } from "@/server/services/auth";
import { resetSchema } from "@/server/validators";

export const POST = open(async (req) => {
  await resetPassword(await parseBody(req, resetSchema));
  return { ok: true };
});

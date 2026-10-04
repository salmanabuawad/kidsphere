import { open } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { homePathFor } from "@/lib/auth/actor";
import { login } from "@/server/services/auth";
import { loginSchema } from "@/server/validators";

export const POST = open(async (req) => {
  const user = await login(await parseBody(req, loginSchema));
  return { redirectTo: homePathFor(user.role) };
});

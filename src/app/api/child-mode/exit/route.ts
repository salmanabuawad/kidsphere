import { cookies } from "next/headers";
import { open } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { CHILD_COOKIE } from "@/lib/auth/cookies";
import { exitChildSession } from "@/server/services/child-mode";
import { childModeExitSchema } from "@/server/validators";

export const POST = open(async (req) => {
  const { pin } = await parseBody(req, childModeExitSchema);
  const jar = await cookies();
  await exitChildSession(jar.get(CHILD_COOKIE)?.value, pin);
  jar.delete(CHILD_COOKIE);
  return { ok: true };
});

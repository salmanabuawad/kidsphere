import { open } from "@/lib/route";
import { getActor } from "@/lib/auth/session";
import { logout } from "@/server/services/auth";

export const POST = open(async () => {
  await logout(await getActor());
  return { ok: true };
});

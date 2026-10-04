import { cookies } from "next/headers";
import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { CHILD_COOKIE, CHILD_SESSION_TTL_MS, cookieOptions } from "@/lib/auth/cookies";
import { launchChildSession } from "@/server/services/child-mode";
import { childModeLaunchSchema } from "@/server/validators";

export const POST = authed(
  async (req, actor) => {
    const { childId, pin } = await parseBody(req, childModeLaunchSchema);
    const token = await launchChildSession(actor, childId, pin);
    (await cookies()).set(CHILD_COOKIE, token, cookieOptions(CHILD_SESSION_TTL_MS));
    return { redirectTo: "/play" };
  },
  { roles: ["TEACHER", "PARENT"] },
);

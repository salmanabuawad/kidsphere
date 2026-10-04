import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { changePassword } from "@/server/services/auth";
import { changePasswordSchema } from "@/server/validators";

export const POST = authed(async (req, actor) => changePassword(actor, await parseBody(req, changePasswordSchema)));

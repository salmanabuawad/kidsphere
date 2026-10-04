import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { assignTeacher } from "@/server/services/admin";
import { assignTeacherSchema } from "@/server/validators";

export const POST = authed(async (req, actor) => assignTeacher(actor, await parseBody(req, assignTeacherSchema)), { roles: ADMIN_ROLES });

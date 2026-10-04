import { authed } from "@/lib/route";
import { saveAsTemplate } from "@/server/services/content";

type P = { id: string };
export const POST = authed<P>(async (_req, actor, { id }) => saveAsTemplate(actor, id), { roles: ["TEACHER"], status: 201 });

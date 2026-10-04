import { authed } from "@/lib/route";
import { submitForReview } from "@/server/services/content";

type P = { id: string };
export const POST = authed<P>(async (_req, actor, { id }) => submitForReview(actor, id), { roles: ["TEACHER"] });

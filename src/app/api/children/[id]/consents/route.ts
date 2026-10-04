import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { createConsent, listConsents } from "@/server/services/media";
import { consentSchema } from "@/server/validators";

type P = { id: string };
export const GET = authed<P>(async (_req, actor, { id }) => listConsents(actor, id));
export const POST = authed<P>(async (req, actor, { id }) => createConsent(actor, id, await parseBody(req, consentSchema)), { roles: ["PARENT"], status: 201 });

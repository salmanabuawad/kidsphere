import { authed } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { getOwnQuestionnaire, listQuestionnairesForStaff, saveQuestionnaire } from "@/server/services/questionnaires";
import { saveQuestionnaireSchema } from "@/server/validators";

type P = { id: string };
/** Parents get their own (resumable) questionnaire; staff get all questionnaires for the child. */
export const GET = authed<P>(async (_req, actor, { id }) => (actor.role === "PARENT" ? getOwnQuestionnaire(actor, id) : listQuestionnairesForStaff(actor, id)));
export const POST = authed<P>(async (req, actor, { id }) => saveQuestionnaire(actor, id, await parseBody(req, saveQuestionnaireSchema)), { roles: ["PARENT"] });

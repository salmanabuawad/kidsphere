import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { db } from "@/lib/db";
import { getOwnQuestionnaire } from "@/server/services/questionnaires";
import { PageHeader } from "@/components/ui/misc";
import { QuestionnaireWizard } from "@/features/questionnaires/questionnaire-wizard";

export default async function QuestionnairePage({ params }: PageProps<"/parent/children/[childId]/questionnaire">) {
  const actor = await requirePageActor(["PARENT"]);
  const { childId } = await params;
  const { t, locale } = await getI18n();
  const { child, questionnaire, answers } = await getOwnQuestionnaire(actor, childId);
  const cls = child.classId ? await db.class.findUnique({ where: { id: child.classId }, select: { name: true } }) : null;
  return (
    <div>
      <PageHeader back={{ href: `/parent/children/${child.id}`, label: child.displayName }} title={t("parent.questionnaire.title")} />
      <QuestionnaireWizard
        childId={child.id}
        initialAnswers={answers}
        initialSection={questionnaire?.currentSection ?? null}
        submitted={questionnaire?.status === "SUBMITTED"}
        header={t("parent.questionnaire.childInfo", { name: child.displayName, date: formatDate(child.dateOfBirth, locale), class: cls?.name ?? "" })}
      />
    </div>
  );
}

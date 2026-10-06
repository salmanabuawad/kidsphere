import { useParams, useSearchParams } from "react-router";
import { BackLink } from "@/components/ui/PageHeader";
import { QuestionnaireWizard, type StaffEntryMode } from "@/features/wizard/questionnaire";
import { useI18n } from "@/i18n/I18nProvider";
import { paths } from "@/lib/paths";

/**
 * /children/:id/parent-view/answers/:step?mode=on_behalf|meeting — staff fill the family's
 * questionnaire for them, or together with them in a meeting (same 9 steps as the parent).
 * Any non-numeric step (e.g. "continue") resumes at the saved step.
 */
export function ParentAnswersPage() {
  const { t } = useI18n();
  const { id = "", step } = useParams();
  const [search] = useSearchParams();
  const mode: StaffEntryMode = search.get("mode") === "meeting" ? "meeting" : "on_behalf";
  const n = Number(step);
  return (
    <div className="space-y-3">
      <BackLink to={paths.childParentView(id)} label={t("parentView.backToParentView")} />
      <QuestionnaireWizard
        key={`${id}:${mode}`}
        childId={id}
        mode={mode}
        step={Number.isInteger(n) ? n : null}
        pathFor={(s) => paths.childParentAnswers(id, s, mode)}
        exitTo={paths.childParentView(id)}
      />
    </div>
  );
}

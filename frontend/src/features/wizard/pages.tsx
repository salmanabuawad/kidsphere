import { Navigate, useNavigate, useParams } from "react-router";
import { PageSkeleton } from "@/components/ui/Spinner";
import { useI18n } from "@/i18n/I18nProvider";
import { paths } from "@/lib/paths";
import { BasicsStep } from "./BasicsStep";
import { FIRST_SECTION_STEP, LAST_STEP, TOTAL_STEPS } from "./definition";
import { QuestionnaireWizard } from "./questionnaire";
import { ReviewStep } from "./ReviewStep";
import { useWizardProfile, WizardStep } from "./WizardEngine";

const REVIEW = TOTAL_STEPS + 1;

/** /children/new — step 1 creates the child, then continues at /children/:id/edit/2. */
export function NewChildPage() {
  return <BasicsStep />;
}

/**
 * /children/:id/edit/:step — staff wizard (the teacher's own answers). `step` is 1–7,
 * "review", or anything else (e.g. "continue") to resume at the saved wizard step.
 * The family's answers are entered from the Parent View (on behalf / in a meeting).
 */
export function ChildEditPage() {
  const { id = "", step: raw = "" } = useParams();
  if (raw === "1") return <BasicsStep childId={id} />;
  return <StaffWizard key={id} childId={id} raw={raw} />;
}

function StaffWizard({ childId, raw }: { childId: string; raw: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const wiz = useWizardProfile(childId);
  const go = (n: number) => navigate(paths.childEdit(childId, n > TOTAL_STEPS ? "review" : n));
  const n = Number(raw);
  const isReview = raw === "review" || n === REVIEW;
  const known = isReview || (Number.isInteger(n) && n >= FIRST_SECTION_STEP && n <= LAST_STEP);

  if (!known) {
    if (wiz.error) return <Navigate to={paths.childEdit(childId, FIRST_SECTION_STEP)} replace />;
    if (!wiz.data) return <PageSkeleton />;
    const saved = wiz.data.wizard.step;
    const target = saved > TOTAL_STEPS ? "review" : Math.max(saved, 1);
    return <Navigate to={paths.childEdit(childId, target)} replace />;
  }
  if (isReview) return <ReviewStep childId={childId} wiz={wiz} onPick={go} />;

  const progress = { current: n, total: TOTAL_STEPS, onPick: (k: number) => void saveAndGo(k) };
  async function saveAndGo(target: number) {
    if (await wiz.persist({ wizard_step: Math.max(target, FIRST_SECTION_STEP) })) go(target);
  }

  return (
    <WizardStep
      key={n}
      childId={childId}
      mode="staff"
      step={n}
      wiz={wiz}
      progress={progress}
      onBack={() => void saveAndGo(n - 1)}
      onNext={() => void saveAndGo(n + 1)}
      onSaveExit={async () => {
        if (await wiz.persist({ wizard_step: n })) navigate(paths.child(childId));
      }}
      nextLabel={n === LAST_STEP ? t("wizard.toReview") : undefined}
    />
  );
}

/**
 * /parent/children/:id/onboarding(/:step) — the family's questionnaire (PW1–PW9) for the
 * parent. Without a step it resumes where they stopped (or shows "sent" once it was sent).
 */
export function ParentOnboardingPage() {
  const { id = "", step } = useParams();
  const n = step === undefined ? null : Number(step);
  return (
    <QuestionnaireWizard
      key={id}
      childId={id}
      mode="self"
      step={n === null || Number.isNaN(n) ? null : n}
      pathFor={(s) => paths.parentOnboardingStep(id, s)}
      exitTo={paths.parentHome()}
    />
  );
}

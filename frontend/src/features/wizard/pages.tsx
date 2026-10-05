import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { Check } from "lucide-react";
import { ParentHomeIcon } from "@/icons";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageSkeleton } from "@/components/ui/Spinner";
import { useI18n } from "@/i18n/I18nProvider";
import { paths } from "@/lib/paths";
import { BasicsStep } from "./BasicsStep";
import { FIRST_SECTION_STEP, LAST_STEP, STEPS, TOTAL_STEPS } from "./definition";
import { ReviewStep } from "./ReviewStep";
import { useWizardProfile, WizardStep } from "./WizardEngine";
import { WizardActions, WizardProgress } from "./WizardFrame";

const REVIEW = TOTAL_STEPS + 1;

/** /children/new — step 1 creates the child, then continues at /children/:id/edit/2. */
export function NewChildPage() {
  return <BasicsStep />;
}

/**
 * /children/:id/edit/:step — staff wizard. `step` is 1–7, "review", or
 * anything else (e.g. "continue") to resume at the saved wizard step.
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
 * /parent/children/:id/onboarding — the same steps 2–7 for a parent (parent
 * questions only). The step lives in ?step= so a reload resumes in place;
 * without it the parent's saved step is used.
 */
export function ParentOnboardingPage() {
  const { id = "" } = useParams();
  return <ParentWizard key={id} childId={id} />;
}

function ParentWizard({ childId }: { childId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const wiz = useWizardProfile(childId);
  const parentSteps = STEPS.map((s) => s.step);
  const total = parentSteps.length;

  if (wiz.error && !wiz.data) return <Alert tone="error">{t("wizard.loadError")}</Alert>;
  if (!wiz.data) return <PageSkeleton />;

  const fromUrl = Number(search.get("step"));
  const saved = wiz.data.wizard.step;
  let step = Number.isInteger(fromUrl) && fromUrl >= FIRST_SECTION_STEP && fromUrl <= REVIEW ? fromUrl : saved;
  if (step < FIRST_SECTION_STEP) step = FIRST_SECTION_STEP;
  if (step > REVIEW) step = REVIEW;
  const index = step - FIRST_SECTION_STEP + 1;
  const go = (s: number) => setSearch({ step: String(s) }, { replace: false });
  const saveAndGo = async (target: number) => {
    if (await wiz.persist({ wizard_step: target })) go(target);
  };

  if (step === REVIEW) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <WizardProgress current={total + 1} total={total} onPick={(k) => go(k + FIRST_SECTION_STEP - 1)} />
        <Card>
          <CardBody className="space-y-4 py-8 text-center">
            <ParentHomeIcon className="mx-auto size-16" aria-hidden />
            <h1 className="font-display text-display-lg font-semibold text-ink">{t("wizard.parent.doneTitle")}</h1>
            <p className="text-ink-muted">{t("wizard.parent.doneIntro")}</p>
            {wiz.data.wizard.completed_at && (
              <p className="inline-flex items-center gap-2 rounded-md border-[1.5px] border-success px-3 py-1.5 text-sm font-semibold text-success">
                <Check className="size-4" strokeWidth={2.5} aria-hidden />
                {t("wizard.parent.alreadySent")}
              </p>
            )}
          </CardBody>
        </Card>
        <WizardActions>
          <Button variant="ghost" onClick={() => go(LAST_STEP)}>
            {t("common.back")}
          </Button>
          <Button
            size="lg"
            loading={wiz.saving}
            data-testid="parent-finish"
            onClick={async () => {
              if (await wiz.persist({ wizard_step: REVIEW, complete: true })) navigate(paths.parentHome());
            }}
          >
            {t("wizard.parent.send")}
          </Button>
        </WizardActions>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {index === 1 && (
        <Alert tone="tip" className="mx-auto max-w-3xl">
          {t("wizard.parent.intro")}
        </Alert>
      )}
      <WizardStep
        key={step}
        childId={childId}
        mode="parent"
        step={step}
        wiz={wiz}
        progress={{ current: index, total, onPick: (k) => void saveAndGo(k + FIRST_SECTION_STEP - 1) }}
        onBack={() => (step === FIRST_SECTION_STEP ? navigate(paths.parentHome()) : void saveAndGo(step - 1))}
        onNext={() => void saveAndGo(step + 1)}
        onSaveExit={async () => {
          if (await wiz.persist({ wizard_step: step })) navigate(paths.parentHome());
        }}
      />
    </div>
  );
}

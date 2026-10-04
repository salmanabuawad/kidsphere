import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { listParentChildren } from "@/server/services/children";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";

export default async function OnboardingPage() {
  const actor = await requirePageActor(["PARENT"]);
  const { t } = await getI18n();
  const children = await listParentChildren(actor);
  const steps = [
    ["💛", t("parent.onboarding.step1")],
    ["👩‍🏫", t("parent.onboarding.step2")],
    ["📖", t("parent.onboarding.step3")],
  ];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t("parent.onboarding.title")}</h1>
      <div className="space-y-3">
        {steps.map(([emoji, text], i) => (
          <Card key={i} className="flex items-center gap-4 p-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-2xl" aria-hidden>
              {emoji}
            </span>
            <p className="text-sm">{text}</p>
          </Card>
        ))}
      </div>
      <Alert tone="info">{t("parent.onboarding.privacy")}</Alert>
      <div className="flex flex-col gap-2">
        {children.map((c) => (
          <ButtonLink key={c.id} href={`/parent/children/${c.id}/questionnaire`} size="lg">
            {t("parent.onboarding.cta")} · {c.displayName}
          </ButtonLink>
        ))}
      </div>
    </div>
  );
}

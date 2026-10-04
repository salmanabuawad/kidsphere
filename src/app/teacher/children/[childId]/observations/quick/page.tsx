import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { getChild } from "@/server/services/children";
import { QuickObservationForm } from "@/features/observations/quick-observation-form";

export default async function QuickObservationPage({ params }: PageProps<"/teacher/children/[childId]/observations/quick">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t } = await getI18n();
  const child = await getChild(actor, childId);
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-xl font-semibold">{t("teacher.observations.quickTitle")}</h2>
      <p className="text-muted mb-4 text-sm">{t("teacher.observations.quickSubtitle")}</p>
      <QuickObservationForm childId={child.id} childName={child.displayName} />
    </div>
  );
}

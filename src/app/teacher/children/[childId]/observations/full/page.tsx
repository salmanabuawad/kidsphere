import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { getChild } from "@/server/services/children";
import { FullObservationForm } from "@/features/observations/full-observation-form";

export default async function FullObservationPage({ params }: PageProps<"/teacher/children/[childId]/observations/full">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t } = await getI18n();
  const child = await getChild(actor, childId);
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="text-xl font-semibold">{t("teacher.observations.fullTitle")}</h2>
      <p className="text-muted mb-4 text-sm">{t("teacher.observations.fullSubtitle")}</p>
      <FullObservationForm childId={child.id} />
    </div>
  );
}

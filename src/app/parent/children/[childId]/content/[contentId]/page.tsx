import { notFound } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { getContent } from "@/server/services/content";
import { PageHeader } from "@/components/ui/misc";
import { ContentPlayer } from "@/features/player/content-player";

/** Parents can read published stories with their child (no drafts, no rationale). */
export default async function ParentContentPage({ params }: PageProps<"/parent/children/[childId]/content/[contentId]">) {
  const actor = await requirePageActor(["PARENT"]);
  const { childId, contentId } = await params;
  const { t } = await getI18n();
  const c = await getContent(actor, contentId);
  if (!c.body) notFound();
  return (
    <div>
      <PageHeader back={{ href: `/parent/children/${childId}`, label: t("common.back") }} title="" />
      <div className="rounded-3xl bg-gradient-to-b from-amber-50 to-sky-50 p-4">
        <ContentPlayer body={c.body} narrations={c.narrations.map((n) => ({ sceneId: n.sceneId, url: `/api/narrations/${n.id}/audio` }))} />
      </div>
    </div>
  );
}

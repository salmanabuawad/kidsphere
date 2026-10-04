import { notFound } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { getContent } from "@/server/services/content";
import { ButtonLink } from "@/components/ui/button";
import { ContentPlayer } from "@/features/player/content-player";

/** Full-screen preview of exactly what the child will see (works for drafts too). */
export default async function PreviewPage({ params }: PageProps<"/teacher/content/[contentId]/preview">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { contentId } = await params;
  const { t } = await getI18n();
  const c = await getContent(actor, contentId);
  if (!("versions" in c) || !c.body) notFound();
  return (
    <div className="-mx-4 -mt-4 min-h-screen bg-gradient-to-b from-amber-50 to-sky-50 px-4 pb-10 md:-mx-8 md:px-8">
      <div className="flex items-center justify-between gap-2 py-3">
        <p className="text-muted rounded-full bg-white/80 px-3 py-1 text-sm shadow-sm" data-testid="preview-banner">
          {t("teacher.preview.banner", { name: c.child?.displayName ?? "" })}
        </p>
        <ButtonLink href={`/teacher/content/${c.id}`} variant="outline" size="sm">
          {t("teacher.preview.exit")}
        </ButtonLink>
      </div>
      <ContentPlayer body={c.body} narrations={c.narrations.map((n) => ({ sceneId: n.sceneId, url: `/api/narrations/${n.id}/audio` }))} />
    </div>
  );
}

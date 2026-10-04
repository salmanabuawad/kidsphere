import { notFound } from "next/navigation";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { getContent } from "@/server/services/content";
import type { Rationale } from "@/lib/ai/schemas";
import { PageHeader } from "@/components/ui/misc";
import { ContentReview } from "@/features/content/content-review";

export default async function ContentPage({ params }: PageProps<"/teacher/content/[contentId]">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { contentId } = await params;
  const { t } = await getI18n();
  const c = await getContent(actor, contentId);
  if (!("versions" in c) || !c.body) notFound();
  return (
    <div>
      <PageHeader
        back={c.child ? { href: `/teacher/children/${c.child.id}/content`, label: c.child.displayName } : { href: "/teacher/library", label: t("nav.library") }}
        title={<span dir="auto">{c.title}</span>}
      />
      <ContentReview
        data={{
          id: c.id,
          title: c.title,
          type: c.type,
          status: c.status,
          language: c.language,
          revision: c.revision,
          isDemoGenerated: c.isDemoGenerated,
          body: c.body,
          rationale: (c.rationale as Rationale | null) ?? null,
          goal: c.goal,
          child: c.child ? { id: c.child.id, displayName: c.child.displayName } : null,
          characters: c.characters.map((ch) => ({ mediaAssetId: ch.mediaAssetId, label: ch.label, usable: ch.usable })),
          narrations: c.narrations.map((n) => ({ id: n.id, sceneId: n.sceneId, approved: n.approved })),
          versions: c.versions.map((v) => ({ id: v.id, versionNumber: v.versionNumber, source: v.source, createdAt: v.createdAt.toISOString() })),
          approvals: c.approvals.map((a) => ({ id: a.id, action: a.action, createdAt: a.createdAt.toISOString(), note: a.note })),
          canRegenerate: !!c.generationContext,
        }}
      />
    </div>
  );
}

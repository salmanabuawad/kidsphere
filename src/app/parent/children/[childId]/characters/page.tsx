import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getChild } from "@/server/services/children";
import { listMedia } from "@/server/services/media";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/misc";
import { CharactersManager } from "@/features/media/characters-manager";

export default async function CharactersPage({ params }: PageProps<"/parent/children/[childId]/characters">) {
  const actor = await requirePageActor(["PARENT"]);
  const { childId } = await params;
  const { t } = await getI18n();
  const child = await getChild(actor, childId);
  const org = await db.organization.findUnique({ where: { id: child.organizationId }, select: { mediaEnabled: true } });
  const media = await listMedia(actor, childId);
  return (
    <div>
      <PageHeader
        back={{ href: `/parent/children/${child.id}`, label: child.displayName }}
        title={t("parent.media.title")}
        description={t("parent.media.subtitle")}
      />
      {org?.mediaEnabled === false ? (
        <Alert tone="info">{t("parent.media.disabled")}</Alert>
      ) : (
        <CharactersManager
          childId={child.id}
          items={media.map((m) => ({
            id: m.id,
            url: m.url,
            personRelation: m.personRelation,
            personLabel: m.personLabel,
            consents: m.consents.map((c) => ({
              id: c.id,
              status: c.status,
              grantedAt: c.grantedAt.toISOString(),
              revokedAt: c.revokedAt?.toISOString() ?? null,
              allowedPurposes: c.allowedPurposes,
              allowedContentTypes: c.allowedContentTypes,
            })),
          }))}
        />
      )}
    </div>
  );
}

import Link from "next/link";
import { ChevronRight, Heart } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { ageInYears } from "@/lib/utils";
import { listParentChildren } from "@/server/services/children";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/misc";

export default async function ParentHome() {
  const actor = await requirePageActor(["PARENT"]);
  const { t } = await getI18n();
  const children = await listParentChildren(actor);
  const questionnaires = await db.parentQuestionnaire.findMany({
    where: { parentId: actor.userId, childId: { in: children.map((c) => c.id) } },
    select: { childId: true, status: true },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("parent.dashboard.title", { name: actor.name.split(" ")[0]! })}</h1>
        <p className="text-muted text-sm">{t("parent.dashboard.subtitle")}</p>
      </div>
      {children.length === 0 && <EmptyState icon={<Heart />} title={t("parent.dashboard.noChildren")} />}
      {children.map((c) => {
        const q = questionnaires.find((x) => x.childId === c.id);
        return (
          <Card key={c.id} className="overflow-hidden">
            <Link href={`/parent/children/${c.id}`} className="flex items-center gap-4 p-4" data-testid={`parent-child-${c.firstName}`}>
              <Avatar name={c.displayName} color={c.avatarColor} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">{c.displayName}</p>
                <p className="text-muted text-sm">
                  {t("teacher.child.age", { n: ageInYears(c.dateOfBirth) })} · {c.class?.name ?? c.kindergarten.name}
                </p>
              </div>
              <ChevronRight className="text-muted size-5 rtl:rotate-180" />
            </Link>
            {q?.status !== "SUBMITTED" && (
              <div className="flex flex-wrap items-center gap-3 border-t border-amber-100 bg-amber-50/70 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-amber-950">{t("parent.dashboard.onboarding")}</p>
                  <p className="text-xs text-amber-900/80">{t("parent.dashboard.onboardingBody")}</p>
                </div>
                <ButtonLink href={`/parent/children/${c.id}/questionnaire`} size="sm" data-testid={`start-questionnaire-${c.firstName}`}>
                  {q ? t("parent.dashboard.continue") : t("parent.dashboard.start")}
                </ButtonLink>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

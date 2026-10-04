import Link from "next/link";
import { Eye, Zap } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { ageInYears } from "@/lib/utils";
import { getClass, listClassChildren } from "@/server/services/children";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { VocabChip } from "@/features/child-understanding/vocab-chip";

export default async function ClassDetail({ params }: PageProps<"/teacher/classes/[classId]">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { classId } = await params;
  const { t, locale } = await getI18n();
  const cls = await getClass(actor, classId);
  const children = await listClassChildren(actor, classId);

  return (
    <div>
      <PageHeader
        back={{ href: "/teacher/classes", label: t("nav.classes") }}
        title={cls.name}
        eyebrow={cls.kindergarten.name}
        description={t("teacher.classDetail.subtitle")}
        actions={
          <ButtonLink href={`/teacher/weekly-plan?classId=${cls.id}`} variant="outline">
            {t("nav.weeklyPlan")}
          </ButtonLink>
        }
      />
      {children.length === 0 ? (
        <EmptyState title={t("teacher.classDetail.empty")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="child-cards">
          {children.map((c) => (
            <Card key={c.id} className="flex flex-col p-4">
              <Link href={`/teacher/children/${c.id}`} className="flex items-center gap-3" data-testid={`child-card-${c.firstName}`}>
                <Avatar name={c.displayName} color={c.avatarColor} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">{c.displayName}</p>
                  <p className="text-muted text-sm">{t("teacher.child.age", { n: ageInYears(c.dateOfBirth) })}</p>
                </div>
              </Link>
              <div className="mt-3 flex min-h-7 flex-wrap gap-1.5">
                {c.strengths.slice(0, 2).map((s) => (
                  <VocabChip key={s} category="STRENGTH" value={s} locale={locale} />
                ))}
                {c.interests.slice(0, 2).map((s) => (
                  <VocabChip key={s} category="INTEREST" value={s} locale={locale} />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.activeGoals.length > 0 && <Badge tone="brand">{t("teacher.classDetail.goals", { n: c.activeGoals.length })}</Badge>}
                {c.pendingCount > 0 && <Badge tone="amber">{t("teacher.classDetail.toConfirm", { n: c.pendingCount })}</Badge>}
                {!c.observedRecently && (
                  <Badge tone="stone">
                    <Eye className="size-3" />
                    {t("teacher.classDetail.noObservation")}
                  </Badge>
                )}
              </div>
              <div className="mt-auto flex gap-2 pt-4">
                <ButtonLink href={`/teacher/children/${c.id}/observations/quick`} size="sm" variant="soft" className="flex-1">
                  <Zap className="size-4" />
                  {t("teacher.classDetail.quickObservation")}
                </ButtonLink>
                <ButtonLink href={`/teacher/children/${c.id}`} size="sm" variant="outline">
                  {t("common.open")}
                </ButtonLink>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { ageInYears } from "@/lib/utils";
import { db } from "@/lib/db";
import { getChild } from "@/server/services/children";
import { Avatar } from "@/components/ui/misc";
import { ChildTabs } from "@/features/children/child-tabs";
import { LaunchChildMode } from "@/features/child-mode/launch-child-mode";
import { LOCALE_NAMES } from "@/lib/i18n/config";

export default async function ChildLayout({ children, params }: { children: React.ReactNode; params: Promise<{ childId: string }> }) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t } = await getI18n();
  const child = await getChild(actor, childId);
  const pending = await db.profileAttribute.count({ where: { childId, status: "PENDING_CONFIRMATION" } });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar name={child.displayName} color={child.avatarColor} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-muted text-sm">{child.class?.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{child.displayName}</h1>
          <p className="text-muted text-sm">
            {t("teacher.child.age", { n: ageInYears(child.dateOfBirth) })} · {LOCALE_NAMES[child.primaryLanguage]}
          </p>
        </div>
        <LaunchChildMode childId={child.id} />
      </div>
      <ChildTabs
        childId={child.id}
        labels={{
          overview: t("teacher.child.tabs.overview"),
          parent: t("teacher.child.tabs.parent"),
          observations: t("teacher.child.tabs.observations"),
          profile: t("teacher.child.tabs.profile"),
          goals: t("teacher.child.tabs.goals"),
          content: t("teacher.child.tabs.content"),
          progress: t("teacher.child.tabs.progress"),
        }}
        pending={pending}
      />
      {children}
    </div>
  );
}

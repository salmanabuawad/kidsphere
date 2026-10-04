import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { childScopeWhere } from "@/lib/permissions";
import { providerStatuses } from "@/lib/ai";
import { PageHeader } from "@/components/ui/misc";
import { StudioForm } from "@/features/content/studio-form";

export default async function StudioPage({ searchParams }: PageProps<"/teacher/studio">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { t } = await getI18n();
  const sp = await searchParams;
  const children = await db.child.findMany({
    where: { AND: [{ archivedAt: null }, childScopeWhere(actor)] },
    select: { id: true, displayName: true, primaryLanguage: true, goals: { where: { status: "ACTIVE" }, select: { id: true, statement: true } } },
    orderBy: { firstName: "asc" },
  });
  const usesDemo = !providerStatuses().some((p) => p.name !== "demo" && p.configured) || process.env.AI_DEFAULT_PROVIDER === "demo";
  return (
    <div>
      <PageHeader title={t("teacher.studio.title")} description={t("teacher.studio.subtitle")} />
      <StudioForm
        childOptions={children}
        initialChildId={typeof sp.childId === "string" ? sp.childId : undefined}
        initialGoalId={typeof sp.goalId === "string" ? sp.goalId : undefined}
        usesDemo={usesDemo}
      />
    </div>
  );
}

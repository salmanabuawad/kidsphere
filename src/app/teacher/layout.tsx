import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { AppShell } from "@/components/layout/app-shell";
import { BrandStyle } from "@/components/layout/brand-style";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor(["TEACHER"]);
  const { t } = await getI18n();
  return (
    <>
      <BrandStyle organizationId={actor.organizationId} />
      <AppShell
        user={{ name: actor.name }}
        roleLabel={t("roles.TEACHER")}
        nav={[
          { href: "/teacher", label: t("nav.dashboard"), icon: "dashboard", exact: true },
          { href: "/teacher/classes", label: t("nav.classes"), icon: "classes" },
          { href: "/teacher/weekly-plan", label: t("nav.weeklyPlan"), icon: "weekly" },
          { href: "/teacher/studio", label: t("nav.studio"), icon: "studio" },
          { href: "/teacher/library", label: t("nav.library"), icon: "library" },
          { href: "/teacher/account", label: t("common.account"), icon: "account" },
        ]}
      >
        {children}
      </AppShell>
    </>
  );
}

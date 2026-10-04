import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { AppShell } from "@/components/layout/app-shell";
import { BrandStyle } from "@/components/layout/brand-style";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor(["PARENT"]);
  const { t } = await getI18n();
  return (
    <>
      <BrandStyle organizationId={actor.organizationId} />
      <AppShell
        variant="parent"
        user={{ name: actor.name }}
        roleLabel={t("roles.PARENT")}
        nav={[
          { href: "/parent", label: t("nav.home"), icon: "home", exact: true },
          { href: "/parent/onboarding", label: t("parent.onboarding.cta"), icon: "templates" },
          { href: "/parent/account", label: t("common.account"), icon: "account" },
        ]}
      >
        {children}
      </AppShell>
    </>
  );
}

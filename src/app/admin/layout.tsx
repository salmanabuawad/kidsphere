import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { BrandStyle } from "@/components/layout/brand-style";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor(ADMIN_ROLES);
  const { t } = await getI18n();
  const orgLevel = actor.role === "SUPER_ADMIN" || actor.role === "ORGANIZATION_ADMIN";
  const nav: NavItem[] = [
    { href: "/admin", label: t("nav.overview"), icon: "chart", exact: true },
    ...(orgLevel ? [{ href: "/admin/organizations", label: t("nav.organizations"), icon: "orgs" } as NavItem] : []),
    { href: "/admin/kindergartens", label: t("nav.kindergartens"), icon: "kindergartens" },
    { href: "/admin/classes", label: t("nav.adminClasses"), icon: "adminClasses" },
    { href: "/admin/children", label: t("nav.children"), icon: "children" },
    { href: "/admin/users", label: t("nav.users"), icon: "users" },
    { href: "/admin/assignments", label: t("nav.assignments"), icon: "assignments" },
    ...(orgLevel
      ? ([
          { href: "/admin/localization", label: t("nav.localization"), icon: "languages" },
          { href: "/admin/settings", label: t("nav.settings"), icon: "settings" },
        ] as NavItem[])
      : []),
    { href: "/admin/templates", label: t("nav.templates"), icon: "templates" },
    { href: "/admin/permissions", label: t("nav.permissions"), icon: "permissions" },
    { href: "/admin/ai", label: t("nav.ai"), icon: "ai" },
    { href: "/admin/audit", label: t("nav.audit"), icon: "audit" },
    { href: "/admin/account", label: t("common.account"), icon: "account" },
  ];
  return (
    <>
      <BrandStyle organizationId={actor.organizationId} />
      <AppShell user={{ name: actor.name }} roleLabel={t(`roles.${actor.role}`)} nav={nav}>
        {children}
      </AppShell>
    </>
  );
}

import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { LOCALE_NAMES } from "@/lib/i18n/config";
import { listOrganizations } from "@/server/services/admin";
import { PageHeader, Table } from "@/components/ui/misc";
import { SimpleFormDialog } from "@/features/admin/simple-form";

export default async function OrganizationsPage() {
  const actor = await requirePageActor(["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
  const { t } = await getI18n();
  const orgs = await listOrganizations(actor);
  return (
    <div>
      <PageHeader
        title={t("admin.organizations.title")}
        actions={
          actor.role === "SUPER_ADMIN" ? (
            <SimpleFormDialog
              title={t("admin.organizations.create")}
              endpoint="/api/admin/organizations"
              successMessage={t("admin.organizations.created")}
              fields={[
                { name: "name", label: t("common.name"), type: "text", required: true },
                { name: "slug", label: t("admin.organizations.slug"), type: "text", required: true, dir: "ltr" },
                { name: "subdomain", label: t("admin.organizations.subdomain"), type: "text", dir: "ltr" },
                {
                  name: "defaultLocale",
                  label: t("admin.localization.default"),
                  type: "select",
                  options: Object.entries(LOCALE_NAMES).map(([v, l]) => ({ value: v, label: l })),
                  defaultValue: "ar",
                  required: true,
                },
              ]}
              nullIfEmpty={["subdomain"]}
            />
          ) : null
        }
      />
      <Table>
        <thead>
          <tr>
            <th>{t("common.name")}</th>
            <th>{t("admin.organizations.slug")}</th>
            <th>{t("admin.organizations.subdomain")}</th>
            <th>{t("common.language")}</th>
            <th>{t("common.details")}</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id}>
              <td className="font-medium">
                <span className="me-2 inline-block size-3 rounded-full align-middle" style={{ backgroundColor: o.brandColor }} aria-hidden />
                {o.name}
              </td>
              <td dir="ltr" className="font-mono text-xs">
                {o.slug}
              </td>
              <td dir="ltr" className="font-mono text-xs">
                {o.subdomain ? `${o.subdomain}.kidsphere.app` : "—"}
              </td>
              <td>{LOCALE_NAMES[o.defaultLocale]}</td>
              <td className="text-muted">{t("admin.organizations.counts", { k: o._count.kindergartens, c: o._count.children, u: o._count.users })}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

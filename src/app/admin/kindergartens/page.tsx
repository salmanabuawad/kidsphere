import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { listKindergartens, listOrganizations } from "@/server/services/admin";
import { PageHeader, Table } from "@/components/ui/misc";
import { SimpleFormDialog } from "@/features/admin/simple-form";

export default async function KindergartensPage() {
  const actor = await requirePageActor(ADMIN_ROLES);
  const { t } = await getI18n();
  const [kgs, orgs] = await Promise.all([listKindergartens(actor), listOrganizations(actor)]);
  const canCreate = actor.role === "SUPER_ADMIN" || actor.role === "ORGANIZATION_ADMIN";
  return (
    <div>
      <PageHeader
        title={t("admin.kindergartens.title")}
        actions={
          canCreate ? (
            <SimpleFormDialog
              title={t("admin.kindergartens.create")}
              endpoint="/api/admin/kindergartens"
              successMessage={t("admin.kindergartens.created")}
              fields={[
                ...(actor.role === "SUPER_ADMIN"
                  ? [
                      {
                        name: "organizationId",
                        label: t("admin.kindergartens.organization"),
                        type: "select" as const,
                        required: true,
                        options: orgs.map((o) => ({ value: o.id, label: o.name })),
                      },
                    ]
                  : []),
                { name: "name", label: t("common.name"), type: "text", required: true },
                { name: "slug", label: t("admin.organizations.slug"), type: "text", required: true, dir: "ltr" },
                { name: "address", label: t("admin.kindergartens.address"), type: "text" },
              ]}
              nullIfEmpty={["address"]}
              omitIfEmpty={["organizationId"]}
            />
          ) : null
        }
      />
      <Table>
        <thead>
          <tr>
            <th>{t("common.name")}</th>
            <th>{t("admin.kindergartens.organization")}</th>
            <th>{t("admin.kindergartens.address")}</th>
            <th>{t("nav.adminClasses")}</th>
            <th>{t("nav.children")}</th>
          </tr>
        </thead>
        <tbody>
          {kgs.map((k) => (
            <tr key={k.id}>
              <td className="font-medium">{k.name}</td>
              <td>{k.organization.name}</td>
              <td className="text-muted">{k.address ?? "—"}</td>
              <td>{k._count.classes}</td>
              <td>{k._count.children}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

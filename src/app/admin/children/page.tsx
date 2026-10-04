import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { LOCALE_NAMES } from "@/lib/i18n/config";
import { listAdminChildren, listAdminClasses, listKindergartens } from "@/server/services/admin";
import { PageHeader, Table } from "@/components/ui/misc";
import { SimpleFormDialog } from "@/features/admin/simple-form";

export default async function AdminChildrenPage() {
  const actor = await requirePageActor(ADMIN_ROLES);
  const { t, locale } = await getI18n();
  const [children, classes, kgs] = await Promise.all([listAdminChildren(actor), listAdminClasses(actor), listKindergartens(actor)]);
  const localeOptions = Object.entries(LOCALE_NAMES).map(([v, l]) => ({ value: v, label: l }));
  return (
    <div>
      <PageHeader
        title={t("admin.children.title")}
        actions={
          <SimpleFormDialog
            title={t("admin.children.create")}
            endpoint="/api/children"
            successMessage={t("admin.children.created")}
            fields={[
              { name: "firstName", label: t("admin.children.firstName"), type: "text", required: true },
              { name: "lastName", label: t("admin.children.lastName"), type: "text" },
              { name: "displayName", label: t("admin.children.displayName"), type: "text" },
              { name: "dateOfBirth", label: t("admin.children.dob"), type: "date", required: true },
              {
                name: "primaryLanguage",
                label: t("admin.children.primaryLanguage"),
                type: "select",
                required: true,
                options: localeOptions,
                defaultValue: "ar",
              },
              {
                name: "kindergartenId",
                label: t("admin.classes.kindergarten"),
                type: "select",
                required: true,
                options: kgs.map((k) => ({ value: k.id, label: k.name })),
                defaultValue: kgs[0]?.id,
              },
              {
                name: "classId",
                label: t("admin.children.class"),
                type: "select",
                nullable: true,
                options: classes.map((c) => ({ value: c.id, label: `${c.name} (${c.kindergarten.name})` })),
              },
            ]}
            nullIfEmpty={["lastName", "classId"]}
            omitIfEmpty={["displayName"]}
          />
        }
      />
      <Table>
        <thead>
          <tr>
            <th>{t("common.name")}</th>
            <th>{t("admin.children.dob")}</th>
            <th>{t("admin.children.primaryLanguage")}</th>
            <th>{t("admin.children.class")}</th>
            <th>{t("admin.children.parents")}</th>
          </tr>
        </thead>
        <tbody>
          {children.map((c) => (
            <tr key={c.id}>
              <td className="font-medium">
                {c.firstName} {c.lastName ?? ""}
              </td>
              <td>{formatDate(c.dateOfBirth, locale)}</td>
              <td>{LOCALE_NAMES[c.primaryLanguage]}</td>
              <td>{c.class?.name ?? t("admin.children.noClass")}</td>
              <td className="text-muted">{c.parents.map((p) => p.parent.name).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

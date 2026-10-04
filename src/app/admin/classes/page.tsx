import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { LOCALE_NAMES } from "@/lib/i18n/config";
import { listAdminClasses, listKindergartens } from "@/server/services/admin";
import { PageHeader, Table } from "@/components/ui/misc";
import { SimpleFormDialog } from "@/features/admin/simple-form";

export default async function AdminClassesPage() {
  const actor = await requirePageActor(ADMIN_ROLES);
  const { t } = await getI18n();
  const [classes, kgs] = await Promise.all([listAdminClasses(actor), listKindergartens(actor)]);
  return (
    <div>
      <PageHeader
        title={t("admin.classes.title")}
        actions={
          <SimpleFormDialog
            title={t("admin.classes.create")}
            endpoint="/api/admin/classes"
            successMessage={t("admin.classes.created")}
            fields={[
              {
                name: "kindergartenId",
                label: t("admin.classes.kindergarten"),
                type: "select",
                required: true,
                options: kgs.map((k) => ({ value: k.id, label: k.name })),
                defaultValue: kgs[0]?.id,
              },
              { name: "name", label: t("common.name"), type: "text", required: true },
              {
                name: "ageBand",
                label: t("admin.classes.ageBand"),
                type: "select",
                required: true,
                options: ["3-4", "4-5", "5-6", "3-5"].map((a) => ({ value: a, label: a })),
                defaultValue: "3-5",
              },
              {
                name: "contentLocale",
                label: t("admin.classes.contentLocale"),
                type: "select",
                required: true,
                options: Object.entries(LOCALE_NAMES).map(([v, l]) => ({ value: v, label: l })),
                defaultValue: "ar",
              },
            ]}
          />
        }
      />
      <Table>
        <thead>
          <tr>
            <th>{t("common.name")}</th>
            <th>{t("admin.classes.kindergarten")}</th>
            <th>{t("admin.classes.ageBand")}</th>
            <th>{t("admin.classes.contentLocale")}</th>
            <th>{t("admin.classes.teachers")}</th>
            <th>{t("admin.classes.children")}</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id}>
              <td className="font-medium">{c.name}</td>
              <td>{c.kindergarten.name}</td>
              <td>{c.ageBand}</td>
              <td>{LOCALE_NAMES[c.contentLocale]}</td>
              <td>{c.teachers.map((tt) => tt.user.name).join(", ") || "—"}</td>
              <td>{c._count.children}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

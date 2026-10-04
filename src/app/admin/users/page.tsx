import type { Role } from "@prisma/client";
import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES, ROLE_RANK } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/i18n/format";
import { LOCALE_NAMES } from "@/lib/i18n/config";
import { listKindergartens, listOrganizations, listUsers } from "@/server/services/admin";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Table } from "@/components/ui/misc";
import { ActionButton, SimpleFormDialog } from "@/features/admin/simple-form";

const ROLES: Role[] = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN", "TEACHER", "PARENT"];

export default async function UsersPage() {
  const actor = await requirePageActor(ADMIN_ROLES);
  const { t, locale } = await getI18n();
  const [users, kgs, orgs] = await Promise.all([listUsers(actor), listKindergartens(actor), listOrganizations(actor)]);
  // UI convenience only — the server enforces the same hierarchy.
  const assignable = ROLES.filter((r) =>
    actor.role === "SUPER_ADMIN"
      ? true
      : ROLE_RANK[r] <= ROLE_RANK[actor.role] && r !== "SUPER_ADMIN" && (actor.role !== "KINDERGARTEN_ADMIN" || ROLE_RANK[r] < ROLE_RANK.KINDERGARTEN_ADMIN),
  );

  return (
    <div>
      <PageHeader
        title={t("admin.users.title")}
        actions={
          <SimpleFormDialog
            title={t("admin.users.create")}
            endpoint="/api/admin/users"
            successMessage={t("admin.users.created")}
            fields={[
              { name: "name", label: t("common.name"), type: "text", required: true },
              { name: "email", label: t("common.email"), type: "email", required: true },
              {
                name: "role",
                label: t("common.role"),
                type: "select",
                required: true,
                options: assignable.map((r) => ({ value: r, label: t(`roles.${r}`) })),
                defaultValue: "TEACHER",
              },
              ...(actor.role === "SUPER_ADMIN"
                ? [
                    {
                      name: "organizationId",
                      label: t("admin.kindergartens.organization"),
                      type: "select" as const,
                      options: orgs.map((o) => ({ value: o.id, label: o.name })),
                    },
                  ]
                : []),
              {
                name: "kindergartenId",
                label: t("admin.classes.kindergarten"),
                type: "select",
                nullable: true,
                options: kgs.map((k) => ({ value: k.id, label: k.name })),
              },
              {
                name: "uiLocale",
                label: t("common.uiLanguage"),
                type: "select",
                required: true,
                options: Object.entries(LOCALE_NAMES).map(([v, l]) => ({ value: v, label: l })),
                defaultValue: "ar",
              },
              { name: "password", label: t("admin.users.password"), type: "password", required: true },
            ]}
            nullIfEmpty={["kindergartenId"]}
            omitIfEmpty={["organizationId"]}
          />
        }
      />
      <Table>
        <thead>
          <tr>
            <th>{t("common.name")}</th>
            <th>{t("common.email")}</th>
            <th>{t("common.role")}</th>
            <th>{t("common.status")}</th>
            <th>{t("admin.users.lastLogin")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="font-medium">{u.name}</td>
              <td dir="ltr" className="text-xs">
                {u.email}
              </td>
              <td>
                <Badge tone="brand">{t(`roles.${u.role}`)}</Badge>
              </td>
              <td>{u.isActive ? <Badge tone="green">{t("admin.users.active")}</Badge> : <Badge tone="stone">{t("admin.users.inactive")}</Badge>}</td>
              <td className="text-muted text-xs">{u.lastLoginAt ? formatDateTime(u.lastLoginAt, locale) : "—"}</td>
              <td>
                {u.id !== actor.userId &&
                  (actor.role === "SUPER_ADMIN" ||
                    ROLE_RANK[u.role] < ROLE_RANK[actor.role] ||
                    (actor.role === "ORGANIZATION_ADMIN" && u.role === "ORGANIZATION_ADMIN")) && (
                    <ActionButton
                      endpoint={`/api/admin/users/${u.id}`}
                      method="PATCH"
                      body={{ isActive: !u.isActive }}
                      label={u.isActive ? t("admin.users.deactivate") : t("admin.users.activate")}
                      success={t("admin.users.updated")}
                    />
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

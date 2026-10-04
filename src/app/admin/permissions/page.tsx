import type { Role } from "@prisma/client";
import { Check, Minus } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { canPerform, type ChildAction } from "@/lib/permissions";
import { PageHeader, Table } from "@/components/ui/misc";

const ROLES: Role[] = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN", "TEACHER", "PARENT"];
const ACTIONS: ChildAction[] = ["view", "viewInternal", "viewSensitive", "observe", "plan", "parentContribute", "manage"];

/** Read-only view of the permission matrix that src/lib/permissions enforces server-side. */
export default async function PermissionsPage() {
  await requirePageActor(ADMIN_ROLES);
  const { t } = await getI18n();
  return (
    <div>
      <PageHeader title={t("admin.permissions.title")} description={t("admin.permissions.subtitle")} />
      <Table>
        <thead>
          <tr>
            <th>{t("admin.permissions.action")}</th>
            {ROLES.map((r) => (
              <th key={r}>{t(`roles.${r}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ACTIONS.map((a) => (
            <tr key={a}>
              <td>
                <span className="text-muted font-mono text-xs" dir="ltr">
                  {a}
                </span>
                <span className="block text-sm">{t(`admin.permissions.actions.${a}`)}</span>
              </td>
              {ROLES.map((r) => (
                <td key={r}>
                  {canPerform(r, a) ? (
                    <Check className="size-4 text-emerald-600" aria-label="yes" />
                  ) : (
                    <Minus className="size-4 text-stone-300" aria-label="no" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="text-muted mt-3 text-xs">{t("admin.permissions.scope")}</p>
    </div>
  );
}

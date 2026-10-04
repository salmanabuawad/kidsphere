import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { listOrganizations } from "@/server/services/admin";
import { PageHeader } from "@/components/ui/misc";
import { SettingsForm } from "@/features/admin/org-settings-form";

export default async function SettingsPage() {
  const actor = await requirePageActor(["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
  const { t } = await getI18n();
  const orgs = await listOrganizations(actor);
  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.settings.title")} />
      {orgs.map((o) => (
        <div key={o.id}>
          {orgs.length > 1 && <h2 className="mb-2 font-semibold">{o.name}</h2>}
          <SettingsForm org={o} />
        </div>
      ))}
    </div>
  );
}

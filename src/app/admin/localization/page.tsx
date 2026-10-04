import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { listOrganizations } from "@/server/services/admin";
import { PageHeader } from "@/components/ui/misc";
import { LocalizationForm } from "@/features/admin/org-settings-form";

export default async function LocalizationPage() {
  const actor = await requirePageActor(["SUPER_ADMIN", "ORGANIZATION_ADMIN"]);
  const { t } = await getI18n();
  const orgs = await listOrganizations(actor);
  return (
    <div className="space-y-5">
      <PageHeader title={t("admin.localization.title")} description={t("admin.localization.subtitle")} />
      {orgs.map((o) => (
        <div key={o.id}>
          {orgs.length > 1 && <h2 className="mb-2 font-semibold">{o.name}</h2>}
          <LocalizationForm org={o} />
        </div>
      ))}
    </div>
  );
}

import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { LOCALE_NAMES } from "@/lib/i18n/config";
import { adminDashboard } from "@/server/services/dashboard";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default async function AdminHome() {
  const actor = await requirePageActor(ADMIN_ROLES);
  const { t } = await getI18n();
  const d = await adminDashboard(actor);
  const m = d.metrics;
  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.dashboard.title")} description={t("admin.dashboard.subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("nav.kindergartens")} value={d.counts.kgs} />
        <Stat label={t("nav.adminClasses")} value={d.counts.classes} />
        <Stat label={t("admin.dashboard.children")} value={d.counts.children} />
        <Stat label={t("admin.dashboard.users")} value={d.counts.users} hint={d.usersByRole.map((u) => `${t(`roles.${u.role}`)}: ${u.count}`).join(" · ")} />
      </div>
      <Card>
        <CardHeader title={t("admin.dashboard.metrics")} />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={t("admin.dashboard.questionnaireCompletion")} value={pct(m.questionnaireCompletion)} />
          <Stat label={t("admin.dashboard.observations")} value={m.observations30d} />
          <Stat label={t("admin.dashboard.quickUnder60")} value={pct(m.quickObservationUnder60s)} />
          <Stat label={t("admin.dashboard.generated")} value={m.generated30d} />
          <Stat label={t("admin.dashboard.approvalRate")} value={pct(m.approvalRate)} />
          <Stat label={t("admin.dashboard.regenerations")} value={m.regenerations30d} />
          <Stat label={t("admin.dashboard.aiCalls")} value={`${m.aiSuccess} / ${m.aiFailure}`} />
          <div className="border-line bg-card rounded-2xl border p-4">
            <p className="text-muted text-sm">{t("admin.dashboard.outcomes")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.outcomes.map((o) => (
                <Badge key={o.result}>
                  {t(`enums.outcome.${o.result}`)}: {o.count}
                </Badge>
              ))}
            </div>
          </div>
          <div className="border-line bg-card rounded-2xl border p-4">
            <p className="text-muted text-sm">{t("admin.dashboard.languages")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.languages.map((l) => (
                <Badge key={l.language}>
                  {LOCALE_NAMES[l.language]}: {l.count}
                </Badge>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t("admin.dashboard.contentTypes")} />
        <CardBody className="flex flex-wrap gap-1.5">
          {m.contentTypes.map((c) => (
            <Badge key={c.type}>
              {t(`enums.contentType.${c.type}`)}: {c.count}
            </Badge>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

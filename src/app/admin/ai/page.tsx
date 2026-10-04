import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/i18n/format";
import { providerStatuses } from "@/lib/ai";
import { aiLogSummary } from "@/server/services/admin";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { PageHeader, SectionTitle, Table } from "@/components/ui/misc";

export default async function AiPage() {
  const actor = await requirePageActor(ADMIN_ROLES);
  const { t, locale } = await getI18n();
  const providers = providerStatuses();
  const logs = await aiLogSummary(actor);
  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.ai.title")} description={t("admin.ai.subtitle")} />
      <Alert tone="info">{t("admin.ai.howTo")}</Alert>
      <Table>
        <thead>
          <tr>
            <th>{t("admin.ai.provider")}</th>
            <th>{t("common.status")}</th>
            <th>{t("admin.ai.model")}</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.name}>
              <td className="font-medium">{p.name === "anthropic" ? "Anthropic Claude" : p.name === "openai" ? "OpenAI" : "DEMO"}</td>
              <td>{p.configured ? <Badge tone="green">{t("admin.ai.configured")}</Badge> : <Badge tone="stone">{t("admin.ai.notConfigured")}</Badge>}</td>
              <td className="font-mono text-xs" dir="ltr">
                {p.model}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div>
        <SectionTitle>{t("admin.ai.recent")}</SectionTitle>
        <Table>
          <thead>
            <tr>
              <th>{t("admin.audit.when")}</th>
              <th>{t("admin.ai.provider")}</th>
              <th>{t("admin.ai.operation")}</th>
              <th>{t("admin.ai.duration")}</th>
              <th>{t("admin.ai.tokens")}</th>
              <th>{t("admin.ai.result")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="text-xs">{formatDateTime(l.createdAt, locale)}</td>
                <td className="text-xs">
                  {l.provider}{" "}
                  <span className="text-muted font-mono" dir="ltr">
                    {l.model}
                  </span>
                </td>
                <td className="font-mono text-xs" dir="ltr">
                  {l.operation}
                </td>
                <td className="text-xs">{l.durationMs} ms</td>
                <td className="text-xs">{l.inputTokens != null ? `${l.inputTokens} / ${l.outputTokens}` : "—"}</td>
                <td>
                  {l.success ? (
                    <Badge tone="green">{t("admin.ai.ok")}</Badge>
                  ) : (
                    <Badge tone="amber">
                      {t("admin.ai.failed")} · {l.errorCode}
                    </Badge>
                  )}
                  {l.repaired && <span className="text-muted ms-1 text-xs">({t("admin.ai.repaired")})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

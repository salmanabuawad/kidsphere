import { useState, type FormEvent } from "react";
import { FlaskConical, PlugZap, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Spinner";
import { Table } from "@/components/ui/Table";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";

/*
 * /admin/ai — the AI engines (backend app/ai/engines; GET/PUT /api/admin/ai/engines,
 * POST …/{engine}/test, GET /api/admin/ai/requests). Engines are capabilities; which provider
 * powers each one is configured here or in AI_<ENGINE>_* environment variables. No secret is
 * ever shown: an engine names the AI_CRED_* environment variable that holds it.
 */

export type EngineStatus = "not_configured" | "disabled" | "provider_missing" | "credentials_missing" | "mock" | "ready";

export type EngineConfig = {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  endpoint: string | null;
  credentials_ref: string | null;
  credentials_set: boolean;
  timeout_seconds: number;
  max_retries: number;
  max_output: number | null;
  daily_cost_limit: number | null;
  unit_cost: number;
  safety_level: "strict" | "standard";
  fallback_provider: string | null;
  fallback_model: string | null;
  source: "database" | "environment" | "mock_mode" | "default";
};

export type EngineRow = {
  engine: string;
  output_kind: string;
  tasks: string[];
  child_facing: boolean;
  long_running: boolean;
  status: EngineStatus;
  config: EngineConfig;
  last_success_at: string | null;
  last_error: { code: string; at: string } | null;
  usage_30d: { requests: number; succeeded: number; failed: number };
  cost_30d: number;
};

export type EnginesResponse = { engines: EngineRow[]; providers: string[]; mock_mode: boolean };

type TestResult = { success: boolean; status: string; provider: string | null; model: string | null; error: { code: string; message: string } | null };

const STATUS_TONE: Record<EngineStatus, Tone> = {
  not_configured: "muted",
  disabled: "muted",
  provider_missing: "attention",
  credentials_missing: "attention",
  mock: "brand",
  ready: "helps",
};

function StatusBadge({ status }: { status: EngineStatus }) {
  const { t } = useI18n();
  return (
    <span data-testid="engine-status" data-status={status}>
      <Badge tone={STATUS_TONE[status]}>{t(`admin.ai.status.${status}`)}</Badge>
    </span>
  );
}

export function AiEnginesPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { formatDateTime } = useFormat();
  const { data, error, loading, reload } = useFetch<EnginesResponse>("/api/admin/ai/engines");
  const [editing, setEditing] = useState<EngineRow | null>(null);
  const none = t("admin.ai.notConfigured");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader icon={<Sparkles />} title={t("admin.ai.title")} description={t("admin.ai.subtitle")} />
      {error ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && !data ? (
        <PageSkeleton />
      ) : data ? (
        <div className="space-y-5">
          {data.mock_mode && <Alert tone="info">{t("admin.ai.mockMode")}</Alert>}
          <Table>
            <thead>
              <tr>
                <th>{t("admin.ai.columns.engine")}</th>
                <th>{t("admin.ai.columns.provider")}</th>
                <th className="max-md:hidden">{t("admin.ai.columns.model")}</th>
                <th>{t("admin.ai.columns.status")}</th>
                <th className="max-lg:hidden">{t("admin.ai.columns.lastSuccess")}</th>
                <th className="max-lg:hidden">{t("admin.ai.columns.lastError")}</th>
                <th className="max-md:hidden">{t("admin.ai.columns.usage")}</th>
                <th className="max-md:hidden">{t("admin.ai.columns.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {data.engines.map((e) => (
                <tr key={e.engine} data-testid={`engine-row-${e.engine}`}>
                  <td>
                    <button type="button" className="min-h-11 text-start font-semibold text-brand underline-offset-2 hover:underline" onClick={() => setEditing(e)}>
                      {t(`admin.ai.engines.${e.engine}`)}
                    </button>
                  </td>
                  <td dir="ltr" className="text-start">{e.config.provider ?? <span className="text-ink-muted">{none}</span>}</td>
                  <td dir="ltr" className="text-start max-md:hidden">{e.config.model ?? <span className="text-ink-muted">{none}</span>}</td>
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="tabular max-lg:hidden">{e.last_success_at ? formatDateTime(e.last_success_at) : "—"}</td>
                  <td className="max-lg:hidden" dir="ltr">
                    {e.last_error ? (
                      <span title={formatDateTime(e.last_error.at)} className="text-caption">
                        {e.last_error.code}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="tabular max-md:hidden">{t("admin.ai.usageCell", { requests: e.usage_30d.requests, failed: e.usage_30d.failed })}</td>
                  <td className="tabular max-md:hidden" dir="ltr">
                    {e.cost_30d.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-caption text-ink-muted">{t("admin.ai.footnote")}</p>
          <RecentRequests />
          {editing && (
            <EngineDialog
              key={editing.engine}
              row={editing}
              providers={data.providers}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                reload();
              }}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

type RequestRow = { id: string; engine: string; task: string; status: string; provider: string | null; error_code: string | null; duration_ms: number | null; created_at: string };

function RecentRequests() {
  const { t } = useI18n();
  const { formatDateTime } = useFormat();
  const { data } = useFetch<{ requests: RequestRow[] }>("/api/admin/ai/requests", { limit: 20 });
  const rows = data?.requests ?? [];
  return (
    <Card>
      <CardHeader title={t("admin.ai.recent")} description={t("admin.ai.recentHint")} />
      <CardBody>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("admin.ai.noRequests")}</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="recent-requests">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="font-semibold text-ink">{t(`admin.ai.engines.${r.engine}`)}</span>
                <span className="text-ink-muted">{t(`admin.ai.requestStatus.${r.status}`)}</span>
                {r.error_code && <span dir="ltr" className="text-caption text-ink-muted">{r.error_code}</span>}
                <span className="tabular text-caption ms-auto text-ink-muted">{formatDateTime(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function num(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

function EngineDialog({ row, providers, onClose, onSaved }: { row: EngineRow; providers: string[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const save = useAction();
  const testing = useAction();
  const c = row.config;
  const [f, setF] = useState({
    enabled: c.enabled,
    provider: c.provider ?? "",
    model: c.model ?? "",
    endpoint: c.endpoint ?? "",
    credentials_ref: c.credentials_ref ?? "",
    timeout_seconds: String(c.timeout_seconds),
    max_retries: String(c.max_retries),
    max_output: c.max_output == null ? "" : String(c.max_output),
    daily_cost_limit: c.daily_cost_limit == null ? "" : String(c.daily_cost_limit),
    unit_cost: c.unit_cost ? String(c.unit_cost) : "",
    safety_level: c.safety_level,
    fallback_provider: c.fallback_provider ?? "",
    fallback_model: c.fallback_model ?? "",
  });
  const [result, setResult] = useState<TestResult | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const name = t(`admin.ai.engines.${row.engine}`);
  const providerOptions = Array.from(new Set([...providers, ...(c.provider ? [c.provider] : [])]));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = (v: string) => v.trim() || null;
    const body = {
      enabled: f.enabled,
      provider: text(f.provider),
      model: text(f.model),
      endpoint: text(f.endpoint),
      credentials_ref: text(f.credentials_ref),
      timeout_seconds: num(f.timeout_seconds),
      max_retries: num(f.max_retries),
      max_output: num(f.max_output),
      daily_cost_limit: num(f.daily_cost_limit),
      unit_cost: num(f.unit_cost),
      safety_level: row.child_facing ? "strict" : f.safety_level,
      fallback_provider: text(f.fallback_provider),
      fallback_model: text(f.fallback_model),
    };
    await save.run(() => api(`/api/admin/ai/engines/${encodeURIComponent(row.engine)}`, { method: "PUT", body }), {
      success: t("admin.ai.saved", { name }),
      onSuccess: onSaved,
    });
  }

  async function test() {
    setResult(null);
    const r = await testing.run(() => api<TestResult>(`/api/admin/ai/engines/${encodeURIComponent(row.engine)}/test`, { method: "POST" }));
    if (r.ok) setResult(r.data);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={name}
      description={t(`admin.ai.hints.${row.engine}`)}
      footer={
        <>
          <Button variant="outline" icon={<FlaskConical />} loading={testing.pending} onClick={() => void test()} className="me-auto" data-testid="engine-test">
            {t("admin.ai.test")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="engine-form" icon={<PlugZap />} loading={save.pending} data-testid="engine-save">
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form id="engine-form" onSubmit={onSubmit} className="space-y-4" aria-label={name}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox label={t("admin.ai.fields.enabled")} checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          <StatusBadge status={row.status} />
        </div>
        {row.child_facing && <p className="text-caption text-ink-muted">{t("admin.ai.childFacing")}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("admin.ai.fields.provider")} hint={t("admin.ai.fields.providerHint")}>
            {(p) => (
              <Select {...p} dir="ltr" value={f.provider} onChange={(e) => set("provider", e.target.value)}>
                <option value="">{t("admin.ai.notConfigured")}</option>
                {providerOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("admin.ai.fields.model")}>
            {(p) => <Input {...p} dir="ltr" maxLength={120} value={f.model} onChange={(e) => set("model", e.target.value)} />}
          </Field>
          <Field label={t("admin.ai.fields.endpoint")} hint={t("admin.ai.fields.endpointHint")}>
            {(p) => <Input {...p} dir="ltr" type="url" maxLength={500} placeholder="https://" value={f.endpoint} onChange={(e) => set("endpoint", e.target.value)} />}
          </Field>
          <Field
            label={t("admin.ai.fields.credentials")}
            hint={c.credentials_ref ? (c.credentials_set ? t("admin.ai.fields.credentialsSet") : t("admin.ai.fields.credentialsMissing")) : t("admin.ai.fields.credentialsHint")}
          >
            {(p) => (
              <Input {...p} dir="ltr" spellCheck={false} maxLength={68} placeholder="AI_CRED_…" value={f.credentials_ref} onChange={(e) => set("credentials_ref", e.target.value.toUpperCase())} />
            )}
          </Field>
          <Field label={t("admin.ai.fields.timeout")}>
            {(p) => <Input {...p} dir="ltr" type="number" min={5} max={600} value={f.timeout_seconds} onChange={(e) => set("timeout_seconds", e.target.value)} />}
          </Field>
          <Field label={t("admin.ai.fields.retries")}>
            {(p) => <Input {...p} dir="ltr" type="number" min={0} max={5} value={f.max_retries} onChange={(e) => set("max_retries", e.target.value)} />}
          </Field>
          <Field label={t("admin.ai.fields.maxOutput")}>
            {(p) => <Input {...p} dir="ltr" type="number" min={1} value={f.max_output} onChange={(e) => set("max_output", e.target.value)} />}
          </Field>
          <Field label={t("admin.ai.fields.dailyCostLimit")} hint={t("admin.ai.fields.costHint")}>
            {(p) => <Input {...p} dir="ltr" type="number" min={0} step="0.01" value={f.daily_cost_limit} onChange={(e) => set("daily_cost_limit", e.target.value)} />}
          </Field>
          <Field label={t("admin.ai.fields.unitCost")}>
            {(p) => <Input {...p} dir="ltr" type="number" min={0} step="0.000001" value={f.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} />}
          </Field>
          <Field label={t("admin.ai.fields.safety")}>
            {(p) => (
              <Select {...p} value={row.child_facing ? "strict" : f.safety_level} disabled={row.child_facing} onChange={(e) => set("safety_level", e.target.value)}>
                <option value="strict">{t("admin.ai.safety.strict")}</option>
                <option value="standard">{t("admin.ai.safety.standard")}</option>
              </Select>
            )}
          </Field>
          <Field label={t("admin.ai.fields.fallbackProvider")}>
            {(p) => (
              <Select {...p} dir="ltr" value={f.fallback_provider} onChange={(e) => set("fallback_provider", e.target.value)}>
                <option value="">—</option>
                {providerOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("admin.ai.fields.fallbackModel")}>
            {(p) => <Input {...p} dir="ltr" maxLength={120} value={f.fallback_model} onChange={(e) => set("fallback_model", e.target.value)} />}
          </Field>
        </div>
        {result && (
          <div data-testid="engine-test-result" data-ok={result.success || result.status === "pending" ? "true" : "false"}>
            <Alert tone={result.success || result.status === "pending" ? "success" : "warning"}>
              {result.success || result.status === "pending"
                ? t("admin.ai.testOk", { provider: result.provider ?? "", model: result.model ?? "" })
                : t("admin.ai.testFailed", { code: result.error?.code ?? "" })}
            </Alert>
          </div>
        )}
      </form>
    </Dialog>
  );
}

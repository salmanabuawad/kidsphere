import { useState, type FormEvent, type ReactNode } from "react";
import { FileText, KeyRound, PlugZap, Server, Settings, Sparkles, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { ToggleChip } from "@/components/ui/Chip";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Spinner";
import { LOCALE_NAMES, LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import type { Language } from "./types";

/*
 * Admin settings (GET /api/admin/settings, PUT /api/admin/settings/{general|ai|reports},
 * POST /api/admin/settings/ai/test) and the read-only system status (GET /api/admin/system).
 * The Anthropic API key is write-only: the API reports key_set / key_last4, never the key, and
 * the key field is never prefilled.
 */

export type ContentLanguage = Language | "child";
export type ProviderMode = "claude" | "template";

export type GeneralSettings = { organization_name: string; default_ui_language: Language; default_content_language: ContentLanguage };
export type AiSettings = {
  provider_mode: ProviderMode;
  model: string;
  effort: string;
  key_set: boolean;
  key_last4: string | null;
  env_key_set: boolean;
  effective_mode: ProviderMode;
};
export type ReportSettings = { header_title: string; footer_note: string | null };
export type AdminSettings = { general: GeneralSettings; ai: AiSettings; reports: ReportSettings };

export type SystemStatus = {
  app_version: string;
  alembic_revision: string | null;
  last_backup_at: string | null;
  ai: { effective_mode: ProviderMode; provider_mode: ProviderMode; model: string; key_source: "settings" | "env" | null };
  counts: { users: number; classes: number; children: number };
};

export type AiTestResult = { ok: boolean; model: string; error_code: string | null };

export const AI_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"];
export const EFFORTS = ["low", "medium", "high"] as const;
const KEY_PREFIX = "sk-ant-";
const TEST_ERRORS = ["AI_NO_KEY", "AI_AUTH", "AI_MODEL_NOT_FOUND", "AI_TIMEOUT", "AI_BAD_REQUEST", "AI_UNAVAILABLE"];

type SaveFn = (section: keyof AdminSettings, body: Record<string, unknown>, success: string) => Promise<boolean>;

function ModeBadge({ mode }: { mode: ProviderMode }) {
  const { t } = useI18n();
  return mode === "claude" ? (
    <Badge tone="brand" icon={<Sparkles aria-hidden />}>
      {t("admin.settings.ai.modeClaude")}
    </Badge>
  ) : (
    <Badge tone="neutral" icon={<FileText aria-hidden />}>
      {t("admin.settings.ai.modeTemplate")}
    </Badge>
  );
}

function GeneralCard({ value, save, pending }: { value: GeneralSettings; save: SaveFn; pending: boolean }) {
  const { t } = useI18n();
  const [name, setName] = useState(value.organization_name);
  const [ui, setUi] = useState<Language>(value.default_ui_language);
  const [content, setContent] = useState<ContentLanguage>(value.default_content_language);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t("admin.settings.required"));
    setError(null);
    await save("general", { organization_name: name.trim(), default_ui_language: ui, default_content_language: content }, t("admin.settings.general.saved"));
  }

  return (
    <Card>
      <form onSubmit={onSubmit} aria-label={t("admin.settings.general.title")}>
        <CardHeader icon={<Settings />} title={t("admin.settings.general.title")} description={t("admin.settings.general.subtitle")} />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field label={t("admin.settings.general.organizationName")} error={error} required className="md:col-span-2">
            {(p) => <Input {...p} dir="auto" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label={t("admin.settings.general.uiLanguage")} hint={t("admin.settings.general.uiLanguageHint")}>
            {(p) => (
              <Select {...p} value={ui} onChange={(e) => setUi(e.target.value as Language)}>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("admin.settings.general.contentLanguage")} hint={t("admin.settings.general.contentLanguageHint")}>
            {(p) => (
              <Select {...p} value={content} onChange={(e) => setContent(e.target.value as ContentLanguage)}>
                <option value="child">{t("admin.settings.general.childLanguage")}</option>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </CardBody>
        <CardFooter>
          <Button type="submit" size="lg" loading={pending}>
            {t("common.save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function AiCard({ value, save, pending }: { value: AiSettings; save: SaveFn; pending: boolean }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<ProviderMode>(value.provider_mode);
  const [model, setModel] = useState(value.model);
  const [effort, setEffort] = useState(value.effort);
  const [key, setKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [result, setResult] = useState<AiTestResult | null>(null);
  const testing = useAction();
  const models = AI_MODELS.includes(value.model) ? AI_MODELS : [value.model, ...AI_MODELS];
  const efforts: string[] = (EFFORTS as readonly string[]).includes(value.effort) ? [...EFFORTS] : [value.effort, ...EFFORTS];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const k = key.trim();
    if (k && (!k.startsWith(KEY_PREFIX) || /\s/.test(k))) return setKeyError(t("admin.settings.ai.keyInvalid"));
    setKeyError(null);
    const body: Record<string, unknown> = { provider_mode: mode, model };
    if ((EFFORTS as readonly string[]).includes(effort)) body.effort = effort;
    if (k) body.anthropic_api_key = k;
    const ok = await save("ai", body, t("admin.settings.ai.saved"));
    if (ok) setKey("");
  }

  async function clearKey() {
    const ok = await save("ai", { clear: true }, t("admin.settings.ai.keyCleared"));
    if (ok) setKey("");
  }

  async function test() {
    setResult(null);
    const r = await testing.run(() => api<AiTestResult>("/api/admin/settings/ai/test", { method: "POST" }));
    if (r.ok) setResult(r.data);
  }

  const keyHint = value.key_set
    ? t("admin.settings.ai.keySaved", { last4: value.key_last4 ?? "" })
    : value.env_key_set
      ? t("admin.settings.ai.keyFromServer")
      : t("admin.settings.ai.keyNone");
  const testError = result && !result.ok && result.error_code && TEST_ERRORS.includes(result.error_code) ? result.error_code : "AI_UNAVAILABLE";

  return (
    <Card>
      <form onSubmit={onSubmit} aria-label={t("admin.settings.ai.title")}>
        <CardHeader icon={<Sparkles />} title={t("admin.settings.ai.title")} description={t("admin.settings.ai.subtitle")} action={<ModeBadge mode={value.effective_mode} />} />
        <CardBody className="space-y-5">
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink" id="ai-mode-label">
              {t("admin.settings.ai.mode")}
            </p>
            <div role="radiogroup" aria-labelledby="ai-mode-label" className="flex flex-wrap gap-2">
              <ToggleChip single selected={mode === "claude"} onToggle={() => setMode("claude")} icon={<Sparkles className="size-4" aria-hidden />}>
                {t("admin.settings.ai.modeClaude")}
              </ToggleChip>
              <ToggleChip single selected={mode === "template"} onToggle={() => setMode("template")} icon={<FileText className="size-4" aria-hidden />}>
                {t("admin.settings.ai.modeTemplate")}
              </ToggleChip>
            </div>
            <p className="text-caption mt-1.5 text-ink-muted">{mode === "claude" ? t("admin.settings.ai.modeClaudeHint") : t("admin.settings.ai.modeTemplateHint")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("admin.settings.ai.model")}>
              {(p) => (
                <Select {...p} dir="ltr" value={model} onChange={(e) => setModel(e.target.value)}>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("admin.settings.ai.effort")} hint={t("admin.settings.ai.effortHint")}>
              {(p) => (
                <Select {...p} value={effort} onChange={(e) => setEffort(e.target.value)}>
                  {efforts.map((ef) => (
                    <option key={ef} value={ef}>
                      {(EFFORTS as readonly string[]).includes(ef) ? t(`admin.settings.ai.efforts.${ef}`) : ef}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label={t("admin.settings.ai.key")} hint={keyHint} error={keyError}>
            {(p) => (
              <Input
                {...p}
                type="password"
                dir="ltr"
                autoComplete="new-password"
                spellCheck={false}
                placeholder={value.key_set ? t("admin.settings.ai.keyReplacePlaceholder") : "sk-ant-…"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            )}
          </Field>
          {result && (
            <Alert tone={result.ok ? "success" : "warning"}>
              {result.ok ? t("admin.settings.ai.testOk", { model: result.model }) : t(`admin.settings.ai.testErrors.${testError}`)}
            </Alert>
          )}
        </CardBody>
        <CardFooter className="justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" icon={<PlugZap />} loading={testing.pending} onClick={() => void test()}>
              {t("admin.settings.ai.test")}
            </Button>
            {value.key_set && (
              <Button variant="ghost" size="lg" icon={<Trash2 />} disabled={pending} onClick={() => void clearKey()}>
                {t("admin.settings.ai.clearKey")}
              </Button>
            )}
          </div>
          <Button type="submit" size="lg" icon={<KeyRound />} loading={pending}>
            {t("common.save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function ReportsCard({ value, save, pending }: { value: ReportSettings; save: SaveFn; pending: boolean }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(value.header_title);
  const [note, setNote] = useState(value.footer_note ?? "");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError(t("admin.settings.required"));
    setError(null);
    await save("reports", { header_title: title.trim(), footer_note: note.trim() }, t("admin.settings.reports.saved"));
  }

  return (
    <Card>
      <form onSubmit={onSubmit} aria-label={t("admin.settings.reports.title")}>
        <CardHeader icon={<FileText />} title={t("admin.settings.reports.title")} description={t("admin.settings.reports.subtitle")} />
        <CardBody className="space-y-4">
          <Field label={t("admin.settings.reports.headerTitle")} error={error} required>
            {(p) => <Input {...p} dir="auto" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
          <Field label={t("admin.settings.reports.footerNote")} hint={t("admin.settings.reports.footerNoteHint")}>
            {(p) => <Textarea {...p} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Alert tone="tip">{t("admin.settings.reports.disclaimerNote")}</Alert>
        </CardBody>
        <CardFooter>
          <Button type="submit" size="lg" loading={pending}>
            {t("common.save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SystemCard() {
  const { t } = useI18n();
  const { formatDateTime, formatNumber } = useFormat();
  const toMessage = useErrorMessage();
  const { data, error } = useFetch<SystemStatus>("/api/admin/system");
  const rows: [string, ReactNode][] = data
    ? [
        [t("admin.settings.system.version"), <span dir="ltr">{data.app_version === "unknown" ? t("admin.settings.system.unknown") : data.app_version}</span>],
        [t("admin.settings.system.migration"), <span dir="ltr">{data.alembic_revision ?? t("admin.settings.system.unknown")}</span>],
        [t("admin.settings.system.lastBackup"), data.last_backup_at ? formatDateTime(data.last_backup_at) : t("admin.settings.system.notAvailable")],
        [
          t("admin.settings.system.ai"),
          <span className="inline-flex flex-wrap items-center gap-2">
            <ModeBadge mode={data.ai.effective_mode} />
            {data.ai.effective_mode === "claude" && <span dir="ltr">{data.ai.model}</span>}
          </span>,
        ],
        [t("admin.settings.system.users"), formatNumber(data.counts.users)],
        [t("admin.settings.system.classes"), formatNumber(data.counts.classes)],
        [t("admin.settings.system.children"), formatNumber(data.counts.children)],
      ]
    : [];
  return (
    <Card>
      <CardHeader icon={<Server />} title={t("admin.settings.system.title")} description={t("admin.settings.system.subtitle")} />
      <CardBody>
        {error ? (
          <p className="text-sm text-ink-muted">{toMessage(error)}</p>
        ) : !data ? (
          <p className="text-sm text-ink-muted">{t("common.loading")}</p>
        ) : (
          <dl className="divide-y divide-line" data-testid="system-status">
            {rows.map(([k, v]) => (
              <div key={k} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
                <dt className="text-sm text-ink-muted">{k}</dt>
                <dd className="text-sm font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload, setData } = useFetch<AdminSettings>("/api/admin/settings");
  const { pending, run } = useAction();
  const [version, setVersion] = useState(0);

  const save: SaveFn = async (section, body, success) => {
    const r = await run(() => api<AdminSettings>(`/api/admin/settings/${section}`, { method: "PUT", body }), { success });
    if (r.ok) {
      setData(r.data);
      if (section === "ai") setVersion((v) => v + 1);
    }
    return r.ok;
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon={<Settings />} title={t("admin.settings.title")} description={t("admin.settings.subtitle")} />
      {error ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && !data ? (
        <PageSkeleton />
      ) : data ? (
        <div className="space-y-6">
          <GeneralCard value={data.general} save={save} pending={pending} />
          <AiCard key={`ai-${version}`} value={data.ai} save={save} pending={pending} />
          <ReportsCard value={data.reports} save={save} pending={pending} />
          <SystemCard key={`system-${version}`} />
        </div>
      ) : null}
    </div>
  );
}

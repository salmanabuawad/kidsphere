import { useEffect, useId, useState } from "react";
import { FileDown } from "lucide-react";
import { Alert, Button, Checkbox, Dialog, Field, Input, Select, toast } from "@/components/ui";
import { LOCALE_NAMES, LOCALES, isLocale, type AppLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import {
  CYCLE_TYPES,
  DEFAULT_FLAGS,
  FLAGS_BY_TYPE,
  RANGE_TYPES,
  REPORT_TYPES,
  SENSITIVE_FLAGS,
  buildRequest,
  exportPdf,
  isReportType,
  rangeError,
  type IncludeFlag,
  type ReportForm,
  type ReportType,
} from "./api";

type Cycle = { id: string; kind: "initial" | "reassessment"; number: number | null; status: "open" | "closed"; filled_on: string };
type CyclesResponse = { current: Cycle | null; earlier: Cycle[] };

/** Local calendar date "YYYY-MM-DD" (the date inputs' format). */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function initialForm(type: ReportType, locale: AppLocale): ReportForm {
  return { report_type: type, language: locale, date_from: "", date_to: "", assessment_id: "", flags: { ...DEFAULT_FLAGS } };
}

/**
 * Export dialog (RP, COVERAGE-MATRIX §5.9): report type, language (defaults to the UI
 * locale), date range (Full, Current development, Timeline), the observation cycle
 * (Teacher observation, Plan), the include toggles of the chosen report and the
 * "personal details" note. The PDF downloads as a blob; its object URL is revoked
 * right after the click (lib/api saveBlob).
 */
export function ExportDialog({
  childId,
  open,
  initialType,
  onClose,
  onExported,
}: {
  childId: string;
  open: boolean;
  initialType: ReportType;
  onClose: () => void;
  onExported?: () => void;
}) {
  const { t, locale } = useI18n();
  const { formatDate } = useFormat();
  const toMessage = useErrorMessage();
  const [form, setForm] = useState<ReportForm>(() => initialForm(initialType, locale));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  // Each time the dialog opens it starts from the chosen report and the current UI language.
  useEffect(() => {
    if (open) {
      setForm(initialForm(initialType, locale));
      setError(null);
    }
  }, [open, initialType, locale]);

  const type = form.report_type;
  const cycles = useFetch<CyclesResponse>(open && CYCLE_TYPES.has(type) ? `/api/children/${encodeURIComponent(childId)}/teacher-assessments` : null);
  const cycleList = cycles.data ? [...(cycles.data.current ? [cycles.data.current] : []), ...(cycles.data.earlier ?? [])] : [];
  const today = todayIso();
  const range = RANGE_TYPES.has(type) ? rangeError(form.date_from, form.date_to, today) : null;
  const flags = FLAGS_BY_TYPE[type];

  const set = <K extends keyof ReportForm>(key: K, value: ReportForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setFlag = (flag: IncludeFlag, value: boolean) => setForm((f) => ({ ...f, flags: { ...f.flags, [flag]: value } }));

  const cycleLabel = (c: Cycle) =>
    t(c.kind === "initial" ? "reports.dialog.cycleInitial" : "reports.dialog.cycleReassessment", {
      number: c.number ?? "",
      date: formatDate(c.filled_on),
    }) + (c.status === "open" ? ` · ${t("reports.dialog.cycleOpen")}` : "");

  async function submit() {
    if (range) return;
    setPending(true);
    setError(null);
    try {
      await exportPdf(childId, buildRequest(form));
      toast(t("reports.dialog.downloaded"));
      onExported?.();
      onClose();
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("reports.dialog.title")}
      description={t("reports.dialog.description")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} icon={<FileDown aria-hidden />} loading={pending} disabled={!!range}>
            {pending ? t("reports.dialog.preparing") : t("reports.dialog.download")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t("reports.dialog.type")} hint={t(`reports.types.${type}.description`)}>
          {(p) => (
            <Select {...p} value={type} onChange={(e) => {
                if (isReportType(e.target.value)) set("report_type", e.target.value);
              }}>
              {REPORT_TYPES.map((r) => (
                <option key={r} value={r}>
                  {t(`reports.types.${r}.title`)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t("reports.dialog.language")} hint={t("reports.dialog.languageHint")}>
          {(p) => (
            <Select {...p} value={form.language} onChange={(e) => {
                if (isLocale(e.target.value)) set("language", e.target.value);
              }}>
              {LOCALES.map((l) => (
                <option key={l} value={l} lang={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {RANGE_TYPES.has(type) && (
          <fieldset className="space-y-2">
            <legend className="text-base font-medium text-ink">{t("reports.dialog.range")}</legend>
            <p className="text-caption text-ink-muted">{t(type === "timeline" ? "reports.dialog.rangeHintTimeline" : "reports.dialog.rangeHint")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("reports.dialog.from")}>
                {(p) => <Input {...p} type="date" max={today} value={form.date_from} onChange={(e) => set("date_from", e.target.value)} />}
              </Field>
              <Field label={t("reports.dialog.to")} error={range ? t(`reports.dialog.rangeError.${range}`) : undefined}>
                {(p) => <Input {...p} type="date" max={today} value={form.date_to} onChange={(e) => set("date_to", e.target.value)} />}
              </Field>
            </div>
          </fieldset>
        )}

        {CYCLE_TYPES.has(type) && (
          <Field label={t("reports.dialog.cycle")} hint={t(type === "intervention_plan" ? "reports.dialog.cycleHintPlan" : "reports.dialog.cycleHint")}>
            {(p) => (
              <Select {...p} value={form.assessment_id} onChange={(e) => set("assessment_id", e.target.value)} disabled={cycles.loading}>
                <option value="">{t(type === "intervention_plan" ? "reports.dialog.cycleAllGoals" : "reports.dialog.cycleDefault")}</option>
                {cycleList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {cycleLabel(c)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        {flags.length > 0 && (
          <fieldset className="space-y-1">
            <legend className="text-base font-medium text-ink">{t("reports.dialog.include")}</legend>
            {flags.map((flag) => (
              <Checkbox
                key={flag}
                name={flag}
                checked={form.flags[flag]}
                onChange={(e) => setFlag(flag, e.target.checked)}
                label={
                  <span>
                    {t(`reports.flags.${flag}`)}
                    {SENSITIVE_FLAGS.includes(flag) && <span className="text-caption block text-ink-muted">{t("reports.dialog.sensitiveHint")}</span>}
                  </span>
                }
              />
            ))}
          </fieldset>
        )}

        <Alert tone="warning" title={t("reports.dialog.personalTitle")}>
          {t("reports.dialog.personal")}
        </Alert>

        {error && (
          <Alert tone="error" title={t("reports.dialog.failed")}>
            {error}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}

import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { FileDown, FileText, History } from "lucide-react";
import { interpolateNodes } from "@/components/source";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Skeleton } from "@/components/ui";
import { ChildLayout } from "@/features/children";
import { LOCALE_NAMES, isLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { REPORT_TYPES, isReportType, reportsUrl, type ExportLog, type ExportRow, type ReportType } from "./api";
import { ExportDialog } from "./ExportDialog";

/**
 * /children/:id/reports — the Reports tab (RP, COVERAGE-MATRIX §5.9): the six PDF
 * reports, each opening the export dialog, then the export log ("Exported on {date}
 * by {name}"). `?type=intervention_plan` opens the dialog on that report. Staff only.
 */
export function ReportsPage() {
  const { id = "" } = useParams();
  return (
    <ChildLayout childId={id}>
      <Reports childId={id} />
    </ChildLayout>
  );
}

export function Reports({ childId }: { childId: string }) {
  const { t } = useI18n();
  const [search, setSearch] = useSearchParams();
  const preset = search.get("type");
  const [dialogType, setDialogType] = useState<ReportType | null>(isReportType(preset) ? preset : null);
  const [lastType, setLastType] = useState<ReportType>(isReportType(preset) ? preset : "full");
  const log = useFetch<ExportLog>(reportsUrl(childId));

  const openDialog = (type: ReportType) => {
    setLastType(type);
    setDialogType(type);
  };
  const closeDialog = () => {
    setDialogType(null);
    if (search.has("type")) {
      const next = new URLSearchParams(search);
      next.delete("type");
      setSearch(next, { replace: true });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={<FileText aria-hidden />} title={t("reports.page.title")} description={t("reports.page.description")} />
        <CardBody className="p-0">
          <ul className="divide-y divide-line">
            {REPORT_TYPES.map((type) => (
              <li key={type} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center md:px-5" data-report={type}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{t(`reports.types.${type}.title`)}</p>
                  <p className="text-caption text-ink-muted">{t(`reports.types.${type}.description`)}</p>
                </div>
                <Button
                  variant="secondary"
                  icon={<FileDown aria-hidden />}
                  onClick={() => openDialog(type)}
                  aria-label={t("reports.page.exportOne", { report: t(`reports.types.${type}.title`) })}
                >
                  {t("reports.page.export")}
                </Button>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Alert tone="info">{t("reports.page.privacy")}</Alert>

      <ExportLogCard log={log.data} loading={log.loading} error={log.error} onRetry={log.reload} />

      <ExportDialog
        childId={childId}
        open={dialogType !== null}
        initialType={dialogType ?? lastType}
        onClose={closeDialog}
        onExported={log.reload}
      />
    </div>
  );
}

function ExportLogCard({ log, loading, error, onRetry }: { log?: ExportLog; loading: boolean; error: unknown; onRetry: () => void }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const rows = log?.exports ?? [];
  return (
    <Card>
      <CardHeader icon={<History aria-hidden />} title={t("reports.log.title")} description={t("reports.log.description")} />
      <CardBody>
        {error ? (
          <Alert
            tone="error"
            action={
              <Button variant="secondary" size="sm" onClick={onRetry}>
                {t("common.retry")}
              </Button>
            }
          >
            {toMessage(error)}
          </Alert>
        ) : loading && !log ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-ink-muted">{t("reports.log.empty")}</p>
        ) : (
          <ul className="divide-y divide-line" aria-label={t("reports.log.title")}>
            {rows.map((row) => (
              <ExportLogRow key={row.id} row={row} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function ExportLogRow({ row }: { row: ExportRow }) {
  const { t } = useI18n();
  const { formatDate, formatDateTime } = useFormat();
  const by = row.generated_by?.name ?? t("reports.log.someone");
  const range =
    row.date_from && row.date_to
      ? t("reports.log.rangeFromTo", { from: formatDate(row.date_from), to: formatDate(row.date_to) })
      : row.date_from
        ? t("reports.log.rangeSince", { from: formatDate(row.date_from) })
        : row.date_to
          ? t("reports.log.rangeUntil", { to: formatDate(row.date_to) })
          : null;
  const sensitive = (["include_health", "include_family", "include_private_notes"] as const).filter((f) => row[f]);
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0" data-export={row.id}>
      <p className="font-medium text-ink">
        {isReportType(row.report_type) ? t(`reports.types.${row.report_type}.title`) : row.report_type}
        <span className="text-ink-muted"> · {isLocale(row.language) ? LOCALE_NAMES[row.language] : row.language}</span>
      </p>
      <p className="text-caption text-ink-muted">
        {interpolateNodes(t("reports.log.exportedBy"), { date: <bdi>{formatDateTime(row.generated_at)}</bdi>, name: <bdi>{by}</bdi> })}
        {range && <> · {range}</>}
      </p>
      {sensitive.length > 0 && (
        <p className="flex flex-wrap gap-1.5">
          {sensitive.map((f) => (
            <Badge key={f} tone="attention">
              {t(`reports.flags.${f}`)}
            </Badge>
          ))}
        </p>
      )}
    </li>
  );
}

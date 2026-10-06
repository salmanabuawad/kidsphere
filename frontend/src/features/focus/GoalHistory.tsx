import { Badge, Button, Dialog, Skeleton } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { changedFields, focusVersionsUrl, type FocusArea, type GoalHistory } from "./api";

/**
 * Every version of a goal (X-14, X-21): when it was opened and closed (each closure keeps its
 * date and reason, even after the goal was reopened) and every change, newest first, with who
 * made it and whether it happened in a development review.
 */
export function GoalHistoryDialog({ focus, onClose }: { focus: FocusArea | null; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog
      open={!!focus}
      onClose={onClose}
      title={focus ? t("focus.history.title", { title: focus.title }) : ""}
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("focus.history.close")}
          </Button>
        </div>
      }
    >
      {focus && <HistoryBody focusId={focus.id} />}
    </Dialog>
  );
}

function HistoryBody({ focusId }: { focusId: string }) {
  const { t } = useI18n();
  const { formatDate, formatDateTime } = useFormat();
  const toMessage = useErrorMessage();
  const { data, error } = useFetch<GoalHistory>(focusVersionsUrl(focusId));
  if (error) return <p className="text-sm text-danger">{toMessage(error)}</p>;
  if (!data) return <Skeleton className="h-32" />;

  const versions = [...data.versions].reverse();
  const fieldLabel = (f: string) => t(`focus.history.fields.${f.replace(/^plan\./, "")}`);
  return (
    <div className="space-y-6" data-testid="goal-history">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">{t("focus.history.statusTitle")}</h3>
        <ol className="space-y-2">
          {data.status_changes.map((c) => (
            <li key={c.seq} data-testid="status-change" className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={c.status === "active" ? "brand" : "muted"}>{t(`focus.history.status.${c.status}`)}</Badge>
              {c.at && <span className="text-ink">{formatDate(c.at)}</span>}
              {c.changed_by_name && <span className="text-ink-muted">{t("focus.history.by", { name: c.changed_by_name })}</span>}
              {c.via === "review" && <Badge tone="outline">{t("focus.history.viaReview")}</Badge>}
              {c.close_reason && (
                <span className="basis-full text-ink-muted" dir="auto">
                  {t("focus.history.reason", { text: c.close_reason })}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">{t("focus.history.changesTitle")}</h3>
        {versions.length <= 1 && <p className="text-sm text-ink-muted">{t("focus.history.none")}</p>}
        <ol className="divide-y divide-line">
          {versions.map((v, i) => {
            const prev = versions[i + 1]?.data ?? null;
            const fields = changedFields(prev, v.data);
            return (
              <li key={v.id} data-testid="goal-version" className="space-y-0.5 py-2 text-sm">
                <p className="text-ink">
                  {v.created_at && <span>{formatDateTime(v.created_at)}</span>}
                  {v.changed_by_name && <span className="text-ink-muted"> · {t("focus.history.by", { name: v.changed_by_name })}</span>}
                  {v.via === "review" && <span className="text-ink-muted"> · {t("focus.history.viaReview")}</span>}
                </p>
                <p className="text-ink-muted">
                  {!prev
                    ? v.via === "backfill"
                      ? t("focus.history.backfill")
                      : t("focus.history.first")
                    : t("focus.history.changed", { fields: fields.map(fieldLabel).join(", ") })}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

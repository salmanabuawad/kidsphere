import { useState, type ReactNode } from "react";
import { useLocation, useParams } from "react-router";
import { History, Pencil } from "lucide-react";
import { ProvenanceBadge } from "@/components/source";
import { Alert, BackLink, Badge, Button, Card, CardBody, CardHeader, Dialog, Skeleton } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useFetch } from "@/lib/useFetch";
import { ChildLayout, childUrl, isStaffView, type ChildDetail } from "@/features/children";
import { QuickObservationForm } from "@/features/observations";
import { isEdited, normalizeVersions, rowFromVersion, versionsUrl, type HelpItem, type ObservationRow, type ObservationVersion } from "./api";
import { ObservationChips, ObservationKind } from "./ObservationsPage";

type FromList = { observation?: ObservationRow; back?: string } | null;

/** A text answer: a string, or {text}. */
function textOf(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && typeof (v as { text?: unknown }).text === "string") return (v as { text: string }).text.trim() || null;
  return null;
}

/**
 * /children/:id/observations/:observationId — one observation with its Observe → Understand
 * → Act details and every earlier version (X-13: observations are never overwritten).
 */
export function ObservationDetailPage() {
  const { id = "", observationId = "" } = useParams();
  const { t } = useI18n();
  const state = useLocation().state as FromList;
  const back = `${paths.childObservations(id)}${state?.back ?? ""}`;
  return (
    <ChildLayout childId={id}>
      <BackLink to={back} label={t("history.detail.back")} className="mb-2" />
      <ObservationDetail childId={id} observationId={observationId} fromList={state?.observation ?? null} />
    </ChildLayout>
  );
}

function ObservationDetail({ childId, observationId, fromList }: { childId: string; observationId: string; fromList: ObservationRow | null }) {
  const { t } = useI18n();
  const history = useFetch<unknown>(versionsUrl(observationId));
  const child = useFetch<{ child: ChildDetail }>(childUrl(childId));
  const [saved, setSaved] = useState<ObservationRow | null>(null);
  const [editing, setEditing] = useState(false);
  const versions = normalizeVersions(history.data);
  const latest = versions[versions.length - 1];
  const current = saved ?? fromList ?? (latest ? rowFromVersion(observationId, latest) : null);

  if (!current) {
    if (history.loading) return <Skeleton className="h-40" />;
    return <Alert tone="error">{t("history.detail.notFound")}</Alert>;
  }
  // Domain 14 runs over time: stages D and E (and the documentation) are often added later.
  // Activity feedback is edited from its activity (the server answers 409).
  const editable = current.source === "quick";
  const focusAreas = child.data && isStaffView(child.data.child) ? child.data.child.focus_areas : [];
  return (
    <div className="space-y-5">
      <CurrentObservation
        o={current}
        edited={versions.length > 1 || isEdited(current)}
        action={
          editable ? (
            <Button size="sm" variant="outline" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(true)}>
              {t("history.detail.edit")}
            </Button>
          ) : null
        }
      />
      {history.data !== undefined && <Versions id={observationId} versions={versions} base={current} />}
      {editable && (
        <Dialog open={editing} onClose={() => setEditing(false)} title={t("history.detail.editTitle")} description={t("history.detail.editHint")} size="lg">
          {editing && (
            <QuickObservationForm
              childId={childId}
              focusAreas={focusAreas}
              initial={current}
              onSaved={(o) => {
                setSaved({ ...current, ...(o as unknown as ObservationRow) });
                setEditing(false);
                history.reload();
              }}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}

function Labelled({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt className="text-caption font-medium text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-base leading-relaxed text-ink" dir="auto">
        {children}
      </dd>
    </div>
  );
}

function CurrentObservation({ o, edited, action }: { o: ObservationRow; edited: boolean; action?: ReactNode }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { optionLabel } = useOptions();
  const d = o.details ?? {};
  const whenDetail = d.when_detail && typeof d.when_detail === "object" ? (d.when_detail as Record<string, unknown>) : {};
  const whenParts = ["time", "activity_text", "with_whom", "before_event", "after_event"].map((k) => textOf(whenDetail[k])).filter(Boolean);
  const when = textOf(d.when) ?? (whenParts.length ? whenParts.join(" · ") : null);
  const needed = textOf(d.what_needed) ?? textOf(d.needs);
  const change = typeof d.did_it_change === "string" ? d.did_it_change : null;
  const helped = (o.what_helped ?? []).map((h: HelpItem) => (h.custom ? h.custom : optionLabel("what_helps", h.key ?? ""))).filter(Boolean);
  const rows: [string, string | null][] = [
    ["whatISee", textOf(d.what_i_see)],
    ["when", when],
    ["whatNeeded", needed],
    ["whatWeDid", textOf(d.what_we_did)],
    ["didItChange", change ? t(`history.detail.changeValues.${change}`) : null],
    ["whatChanged", textOf(d.what_changed)],
    ["documentation", textOf(d.documentation)],
    ["note", textOf(o.note)],
  ];
  return (
    <Card data-testid="observation-detail">
      <CardHeader
        title={<ObservationKind o={o} />}
        description={
          <>
            {formatDate(o.observed_at, { dateStyle: "full", timeStyle: "short" })}
            {o.created_by?.name ? (
              <>
                {" · "}
                <bdi>{o.created_by.name}</bdi>
              </>
            ) : null}
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceBadge kind="teacher_observed" />
            {edited && (
              <Badge tone="muted" className="border border-line">
                <span data-testid="edited-marker">{t("history.observations.edited")}</span>
              </Badge>
            )}
            {action}
          </div>
        }
      />
      <CardBody className="space-y-4">
        {o.observation ? (
          <blockquote className="border-s-4 border-line-strong ps-3 text-lg leading-relaxed text-ink" dir="auto">
            {o.observation}
          </blockquote>
        ) : (
          <p className="text-sm text-ink-muted">{t("history.observations.resultOnly")}</p>
        )}
        <ObservationChips o={o} />
        <dl className="space-y-3">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <Labelled key={k} label={t(`history.detail.${k}`)}>
                {v}
              </Labelled>
            ))}
          {helped.length > 0 && <Labelled label={t("history.detail.whatHelped")}>{helped.join(" · ")}</Labelled>}
        </dl>
      </CardBody>
    </Card>
  );
}

/** Every saved version, newest first: the first one is the original text (never overwritten). */
function Versions({ id, versions, base }: { id: string; versions: ObservationVersion[]; base: ObservationRow }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const newestFirst = [...versions].reverse();
  return (
    <section aria-labelledby="versions-title" className="rounded-lg border border-line bg-surface p-4 md:p-5" data-testid="observation-versions">
      <h2 id="versions-title" className="font-display text-title flex items-center gap-2 font-semibold text-ink">
        <History className="size-5 text-ink-muted" aria-hidden />
        {t("history.detail.versions")}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{t("history.detail.versionsHint")}</p>
      {versions.length <= 1 ? (
        <p className="mt-3 text-sm text-ink-muted">{t("history.detail.noVersions")}</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {newestFirst.map((v, i) => {
            const row = rowFromVersion(id, v, base);
            const label = i === 0 ? t("history.detail.current") : v.seq === versions[0]!.seq ? t("history.detail.first") : null;
            return (
              <li key={`${v.id}`} className="rounded-md bg-tray px-4 py-3" data-testid="observation-version">
                <p className="text-caption flex flex-wrap items-center gap-2 text-ink-muted">
                  {label && <span className="font-semibold text-ink">{label}</span>}
                  {v.created_at && (
                    <span>
                      {v.changed_by_name
                        ? t("history.detail.savedBy", { name: v.changed_by_name, date: formatDate(v.created_at, { dateStyle: "medium", timeStyle: "short" }) })
                        : formatDate(v.created_at, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  )}
                </p>
                {row.observation ? (
                  <p className="mt-1 text-base leading-relaxed text-ink" dir="auto">
                    {row.observation}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-ink-muted">{t("history.detail.empty")}</p>
                )}
                <ObservationChips o={{ ...row, result: null, focus_area_title: null }} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

import { useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { ClipboardList, History, Lock, PencilLine, Users } from "lucide-react";
import { NotAnswered, ProvenanceBadge, StatusPill } from "@/components/source";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Chip, ToggleChip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { PageSkeleton, Spinner } from "@/components/ui/Spinner";
import { ChildLayout } from "@/features/children";
import type { ChildBasics } from "@/features/wizard/api";
import {
  AnswerView,
  LegacyValueView,
  QUESTIONNAIRE,
  dataSection,
  earlierAnswers,
  historyUrl,
  isPrivate,
  lastStamp,
  localized,
  parentSections,
  profileUrl,
  questions,
  sectionStatus,
  SectionStatusControl,
  type PerspectiveDoc,
  type ProfileHistory,
  type ProfileVersion,
  type QProfile,
  type SectionData,
  type Stamp,
} from "@/features/wizard/questionnaire";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import type { RegistrySection } from "@/lib/sourceModel";
import { useSourceModel } from "@/lib/sourceModel";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";

const childUrl = (id: string) => `/api/children/${encodeURIComponent(id)}`;

/** /children/:id/parent-view — the family's complete questionnaire, read-only (PV, COVERAGE-MATRIX §5.3). */
export function ParentViewPage() {
  const { id = "" } = useParams();
  return (
    <ChildLayout childId={id}>
      <ParentView childId={id} />
    </ChildLayout>
  );
}

/** {section: data} as it was when the family first sent the questionnaire (the "initial" versions). */
function initialSections(history: ProfileHistory | undefined): Record<string, SectionData> {
  const out: Record<string, SectionData> = {};
  for (const v of history?.versions ?? []) {
    const [who, section] = v.key.split(":");
    if (who === "parent" && section && !section.startsWith("_") && v.initial) out[section] = v.data;
  }
  return out;
}

export function ParentView({ childId }: { childId: string }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const sm = useSourceModel();
  const profile = useFetch<QProfile>(profileUrl(childId));
  const child = useFetch<{ child: ChildBasics }>(childUrl(childId));
  const [view, setView] = useState<"latest" | "initial">("latest");
  const [historyFor, setHistoryFor] = useState<RegistrySection | null>(null);
  const initial = useFetch<ProfileHistory>(view === "initial" ? historyUrl(childId) : null, { perspective: "parent" });
  const reg = sm.registry(QUESTIONNAIRE);

  if (profile.error && !profile.data)
    return (
      <Alert tone="error" action={<Button size="sm" variant="outline" onClick={profile.reload}>{t("common.retry")}</Button>}>
        {toMessage(profile.error)}
      </Alert>
    );
  if (!profile.data || (!sm.ready && !sm.error)) return <PageSkeleton />;
  if (!reg) return <Alert tone="error">{t("parentView.unavailable")}</Alert>;

  const doc = profile.data.parent_perspective;
  const record = profile.data.questionnaire ?? doc.questionnaire ?? null;
  const sent = record?.status === "submitted";
  const showingInitial = view === "initial" && sent;
  const sections = showingInitial ? initialSections(initial.data) : doc.sections;
  const resumeStep = Math.min(Math.max(doc.wizard?.step ?? 1, 1), 9);

  return (
    <div className="space-y-5" data-testid="parent-view">
      <HeaderCard doc={doc} childId={childId} resumeStep={resumeStep} title={sm.label({ label: localized(reg.meta.title) })} />

      {sent && (
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("parentView.versions.label")}>
          <ToggleChip single selected={view === "latest"} onToggle={() => setView("latest")}>
            {t("parentView.versions.latest")}
          </ToggleChip>
          <ToggleChip single selected={view === "initial"} onToggle={() => setView("initial")}>
            {t("parentView.versions.initial")}
          </ToggleChip>
          {showingInitial && initial.loading && <Spinner className="size-5" />}
        </div>
      )}
      {showingInitial && <Alert tone="tip">{t("parentView.versions.initialNote")}</Alert>}

      {parentSections(reg).map((section) => (
        <SectionView
          key={section.key}
          section={section}
          data={sections[dataSection(section)] ?? {}}
          sections={sections}
          doc={doc}
          child={child.data?.child}
          onHistory={() => setHistoryFor(section)}
          status={showingInitial ? undefined : { childId, onSaved: profile.setData }}
        />
      ))}

      <FirstReadingCard profile={profile.data} childId={childId} />

      {historyFor && <HistoryDialog childId={childId} section={historyFor} onClose={() => setHistoryFor(null)} child={child.data?.child} />}
    </div>
  );
}

function HeaderCard({ doc, childId, resumeStep, title }: { doc: PerspectiveDoc; childId: string; resumeStep: number; title: string }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { optionLabel } = useOptions();
  const record = doc.questionnaire;
  const staffStamp = Object.keys(doc.entered ?? {})
    .map((s) => lastStamp(doc, [s]))
    .filter((s): s is Stamp => !!s && s.role !== "parent")
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  let status: ReactNode;
  if (record?.status === "submitted")
    status = <Badge tone="success">{t("parentView.header.sent", { date: record.submitted_at ? formatDate(record.submitted_at) : "" })}</Badge>;
  else if (record) status = <Badge tone="brand">{t("parentView.header.draft")}</Badge>;
  else status = <Badge tone="muted">{t("parentView.header.notStarted")}</Badge>;
  const meeting = record?.meeting;
  return (
    <Card>
      <CardHeader
        icon={<ClipboardList />}
        title={title}
        description={t("parentView.header.description")}
        action={status}
      />
      <CardBody className="space-y-4">
        {record && (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {record.filled_at && (
              <div>
                <dt className="text-caption text-ink-muted">{t("parentView.header.filledOn")}</dt>
                <dd className="text-ink">
                  <bdi className="tabular">{formatDate(record.filled_at)}</bdi>
                  {record.school_year && <span className="text-ink-muted"> · {t("parentView.header.schoolYear", { year: record.school_year })}</span>}
                </dd>
              </div>
            )}
            {record.entry_mode && (
              <div>
                <dt className="text-caption text-ink-muted">{t("parentView.header.howFilled")}</dt>
                <dd className="text-ink">{optionLabel("pq_entry_modes", record.entry_mode)}</dd>
              </div>
            )}
            {meeting?.date && (
              <div>
                <dt className="text-caption text-ink-muted">{t("parentView.header.meeting")}</dt>
                <dd className="text-ink">
                  <bdi className="tabular">{formatDate(meeting.date)}</bdi>
                  {meeting.attendees?.length ? ` · ${meeting.attendees.map((a) => optionLabel("relations", a)).join(", ")}` : null}
                </dd>
              </div>
            )}
          </dl>
        )}
        {staffStamp && (
          <ProvenanceBadge kind="parent_said" enteredBy={staffStamp.by_name} enteredAt={staffStamp.at} mode={staffStamp.mode} />
        )}
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={paths.childParentAnswers(childId, resumeStep, "on_behalf")} variant="secondary" icon={<PencilLine aria-hidden />}>
            {t("parentView.actions.onBehalf")}
          </ButtonLink>
          <ButtonLink to={paths.childParentAnswers(childId, 1, "meeting")} variant="ghost" icon={<Users aria-hidden />}>
            {t("parentView.actions.meeting")}
          </ButtonLink>
        </div>
      </CardBody>
    </Card>
  );
}

function PrivateBadge() {
  const { t } = useI18n();
  return (
    <Badge tone="outline" icon={<Lock aria-hidden />}>
      {t("parentView.private")}
    </Badge>
  );
}

function SectionView({
  section,
  data,
  sections,
  doc,
  child,
  onHistory,
  status,
}: {
  section: RegistrySection;
  data: SectionData;
  sections: Record<string, SectionData>;
  doc: PerspectiveDoc;
  child: ChildBasics | undefined;
  onHistory: () => void;
  /** Staff set the section's status (Review later, …); absent while the first-sent answers are shown. */
  status?: { childId: string; onSaved: (p: QProfile) => void };
}) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const ds = dataSection(section);
  const items = questions(sm.registry(QUESTIONNAIRE), section.key);
  const stamp = lastStamp(doc, [ds]);
  const earlier = earlierAnswers(sm.registry(QUESTIONNAIRE), sections, ds);
  const heart = section.key === "heart";

  const list = (
    <dl className="space-y-5">
      {items.map((item) => {
        const answer = (
          <dd className={cn("mt-1.5", heart && "rounded-lg bg-interest-soft p-4 font-display text-title")}>
            <AnswerView item={item} data={data} child={child} />
          </dd>
        );
        const label = (
          <dt className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-muted">
            <span dir="auto">{sm.label(item)}</span>
            {isPrivate(item) && section.private !== true && <PrivateBadge />}
          </dt>
        );
        if (item.sensitivity === "family" && section.private !== true)
          return (
            <div key={item.id} data-item={item.id}>
              <details className="group rounded-md border border-line px-3 py-2">
                <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 text-sm font-semibold text-ink-muted">
                  <span dir="auto">{sm.label(item)}</span>
                  <PrivateBadge />
                </summary>
                {answer}
              </details>
            </div>
          );
        return (
          <div key={item.id} data-item={item.id}>
            {label}
            {answer}
          </div>
        );
      })}
    </dl>
  );

  return (
    <Card data-section={section.key}>
      <CardHeader
        title={sm.label(section)}
        action={
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            {section.private === true && <PrivateBadge />}
            <StatusPill status={sectionStatus(doc, ds)} wording="answers" />
            <Button variant="ghost" size="sm" icon={<History aria-hidden />} onClick={onHistory}>
              {t("parentView.history.open")}
            </Button>
          </span>
        }
      />
      <CardBody className="space-y-4">
        {stamp && (
          <ProvenanceBadge
            kind="parent_said"
            enteredBy={stamp.role !== "parent" ? stamp.by_name : undefined}
            enteredAt={stamp.role !== "parent" ? stamp.at : undefined}
            mode={stamp.mode}
          />
        )}
        {section.private === true ? (
          <details className="group rounded-md border border-line px-3 py-2" data-private-section="">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-brand">
              <Lock className="size-4" aria-hidden />
              {t("parentView.showPrivate")}
            </summary>
            <div className="pt-3">{list}</div>
          </details>
        ) : (
          list
        )}
        {status && <SectionStatusControl childId={status.childId} section={ds} value={sectionStatus(doc, ds)} onSaved={status.onSaved} />}
        {earlier.length > 0 && (
          <div className="space-y-3 rounded-md bg-tray p-3" data-testid="earlier-form">
            <p className="text-sm font-semibold text-ink">{t("parentView.earlierForm")}</p>
            {earlier.map((e) => (
              <div key={e.field}>
                <p className="text-caption text-ink-muted">{sm.label(e)}</p>
                <LegacyValueView kind={e.kind} options={e.options} value={sections[e.field.split(".")[0]!]?.[e.field.split(".")[1]!]} />
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function FirstReadingCard({ profile, childId }: { profile: QProfile; childId: string }) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { optionLabel } = useOptions();
  const bridge = profile.teacher_perspective?.sections?.bridge ?? {};
  const section = sm.section(QUESTIONNAIRE, "bridge");
  const strengths = Array.isArray(bridge.main_strengths) ? (bridge.main_strengths as { key?: string; custom?: string }[]) : [];
  return (
    <Card data-testid="first-reading">
      <CardHeader
        title={section ? sm.label(section) : t("parentView.firstReading.title")}
        description={t("parentView.firstReading.description")}
        action={<StatusPill status={profile.section_status?.teacher?.bridge} wording="answers" />}
      />
      <CardBody className="space-y-3">
        {strengths.length ? (
          <div className="flex flex-wrap gap-2">
            {strengths.map((s, i) => (
              <Chip key={i} tone="strength">
                {s.key ? optionLabel("strengths", s.key) : s.custom}
              </Chip>
            ))}
          </div>
        ) : (
          <NotAnswered />
        )}
        <ButtonLink to={paths.childQuickBaseline(childId)} variant="secondary">
          {t("parentView.firstReading.open")}
        </ButtonLink>
      </CardBody>
    </Card>
  );
}

function HistoryDialog({ childId, section, onClose, child }: { childId: string; section: RegistrySection; onClose: () => void; child: ChildBasics | undefined }) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { formatDateTime } = useFormat();
  const { optionLabel } = useOptions();
  const ds = dataSection(section);
  const history = useFetch<ProfileHistory>(historyUrl(childId), { perspective: "parent", section: ds });
  const versions: ProfileVersion[] = [...(history.data?.versions ?? [])].reverse();
  const items = questions(sm.registry(QUESTIONNAIRE), section.key);
  const via = (v: ProfileVersion) => (["self", "on_behalf", "meeting"].includes(v.via) ? optionLabel("pq_entry_modes", v.via) : t("parentView.history.earlier"));
  return (
    <Dialog open onClose={onClose} title={t("parentView.history.title", { section: sm.label(section) })} size="lg">
      <div className="space-y-4">
        {history.loading && !history.data && <Spinner />}
        {history.data && versions.length === 0 && <p className="text-sm text-ink-muted">{t("parentView.history.empty")}</p>}
        <ol className="space-y-4">
          {versions.map((v) => (
            <li key={v.id} className="rounded-md border border-line p-3" data-version={v.seq}>
              <p className="mb-2 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                <bdi className="tabular">{formatDateTime(v.created_at)}</bdi>
                {v.changed_by_name && <bdi>{v.changed_by_name}</bdi>}
                <span>· {via(v)}</span>
                {v.initial && <Badge tone="brand">{t("parentView.history.initial")}</Badge>}
              </p>
              <dl className="space-y-3">
                {items.map((item) => (
                  <div key={item.id}>
                    <dt className="text-caption font-semibold text-ink-muted">{sm.label(item)}</dt>
                    <dd>
                      <AnswerView item={item} data={v.data ?? {}} child={child} />
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </Dialog>
  );
}

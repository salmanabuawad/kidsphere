import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Lock, Save, Send, Users } from "lucide-react";
import { NotAnswered, StatusPill } from "@/components/source";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ToggleChip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Field";
import { PageSkeleton } from "@/components/ui/Spinner";
import { ParentHomeIcon } from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import type { Registry, RegistryItem, RegistrySection } from "@/lib/sourceModel";
import { useFitPages } from "@/lib/useFitPages";
import { useSourceModel } from "@/lib/sourceModel";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { childUrl, type ChildBasics } from "../api";
import { Question } from "../fields";
import { childFirstName } from "../WizardEngine";
import { SaveLaterLabel, WizardActions, WizardProgress } from "../WizardFrame";
import { QuestionControl } from "./controls";
import {
  DONE_STEP,
  LAST_STEP,
  QUESTIONNAIRE,
  clampStep,
  dataSection,
  fieldOf,
  isObj,
  isPrivate,
  isShown,
  localized,
  questions,
  sectionStatus,
  steps,
  str,
  type EntryMode,
  type Meeting,
  type StepMeta,
} from "./model";
import { SectionStatusControl } from "./SectionStatusControl";
import { useQuestionnaire, type QuestionnaireState } from "./useQuestionnaire";

/**
 * The parent questionnaire as a 9-step wizard (PW1–PW9, COVERAGE-MATRIX §5.2), rendered
 * from the registry in source order. Parents fill it in themselves (`self`); staff use the
 * same flow for the family (`on_behalf`) or together with them (`meeting`: one card at a
 * time, with the meeting date and who came). Every question can be skipped; follow-ups
 * open after "yes" / "other"; progress is saved per step and the last step sends it.
 *
 * `step` null resumes at the saved step (or the "sent" page once the family sent it).
 */
export function QuestionnaireWizard({
  childId,
  mode,
  step,
  pathFor,
  exitTo,
}: {
  childId: string;
  mode: EntryMode;
  step: number | null;
  pathFor: (step: number) => string;
  exitTo: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const sm = useSourceModel();
  const q = useQuestionnaire(childId, mode);
  const child = useFetch<{ child: ChildBasics }>(childUrl(childId));
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const reg = sm.registry(QUESTIONNAIRE);
  const allSteps = steps(reg);

  if (q.error && !q.data) return <Alert tone="error">{t("wizard.loadError")}</Alert>;
  if (!q.data || (!sm.ready && !sm.error)) return <PageSkeleton />;
  if (!reg || !allSteps.length) return <Alert tone="error">{t("wizard.questionnaire.unavailable")}</Alert>;

  const record = q.data.questionnaire ?? q.data.parent_perspective.questionnaire ?? null;
  if (step === null) {
    const saved = q.data.parent_perspective.wizard?.step ?? q.data.wizard.step;
    const target = record?.status === "submitted" && mode === "self" ? DONE_STEP : Math.min(clampStep(saved), LAST_STEP);
    return <Navigate to={pathFor(target)} replace />;
  }

  const current = clampStep(step);
  const name = childFirstName(child.data?.child, t("wizard.theChild"));
  const total = allSteps.length;
  const meetingPatch = mode === "meeting" && meeting ? { meeting } : undefined;
  const go = async (target: number) => {
    if (await q.persist({ wizard_step: Math.min(target, DONE_STEP), questionnaire: meetingPatch })) navigate(pathFor(target));
  };

  if (current >= DONE_STEP) return <Done mode={mode} sent={record?.status === "submitted"} name={name} reviewTo={pathFor(1)} exitTo={exitTo} />;

  const meta = allSteps.find((s) => s.step === current) ?? allSteps[0]!;
  const sectionKeys = [...new Set(meta.sections)];

  const parts = sectionKeys
    .map((key) => ({ key, section: sm.section(QUESTIONNAIRE, key), items: questions(reg, key, current) }))
    .filter((x): x is { key: string; section: RegistrySection; items: RegistryItem[] } => !!x.section);
  return (
    <StepView
      key={current}
      {...{ current, total, allSteps, meta, reg, mode, name, record, meeting, setMeeting, q, child: child.data?.child, childId, go, exitTo, pathFor, meetingPatch, parts }}
    />
  );
}

type Part = { key: string; section: RegistrySection; items: RegistryItem[] };

/** One questionnaire step, split into screen-sized pages of questions (no vertical scrolling). */
function StepView({
  current, total, allSteps, meta, reg, mode, name, record, meeting, setMeeting, q, child, childId, go, exitTo, pathFor, meetingPatch, parts,
}: {
  current: number;
  total: number;
  allSteps: StepMeta[];
  meta: StepMeta;
  reg: Registry;
  mode: EntryMode;
  name: string;
  record: { meeting?: Meeting | null } | null;
  meeting: Meeting | null;
  setMeeting: (m: Meeting) => void;
  q: QuestionnaireState;
  child: ChildBasics | undefined;
  childId: string;
  go: (target: number) => Promise<void>;
  exitTo: string;
  pathFor: (step: number) => string;
  meetingPatch: { meeting: Meeting } | undefined;
  parts: Part[];
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const sm = useSourceModel();
  const offsets = parts.reduce<number[]>((acc, _p, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + parts[i - 1]!.items.length], []);
  // Reserve: the sticky action bar, the section card header and padding, the page line.
  const fit = useFitPages(parts.reduce((n, p) => n + p.items.length, 0), { reserve: 250 });
  return (
    <div className="mx-auto max-w-5xl space-y-4" data-step={current}>
      <div className="flex flex-col gap-3 lg:flex-row-reverse lg:items-end lg:justify-between lg:gap-8">
        <div className="lg:w-80 lg:shrink-0">
          <WizardProgress current={current} total={total} labels={allSteps.map((s) => sm.label(s))} onPick={(n) => void go(n)} />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-title md:text-display-lg font-semibold text-ink">{sm.label(meta)}</h1>
          {current === 1 && (
            <p className="text-sm text-ink-muted md:text-base" dir="auto">
              {sm.label({ label: localized(reg.meta.purpose) })}
            </p>
          )}
        </div>
      </div>

      {mode === "on_behalf" && <Alert tone="info">{t("wizard.questionnaire.onBehalfBanner", { name })}</Alert>}
      {mode === "meeting" && (
        <MeetingCard value={meeting ?? record?.meeting ?? null} onChange={setMeeting} compact={current !== 1} />
      )}

      <div ref={fit.containerRef} className="space-y-4">
        {parts.map((part, i) => (
          <SectionCard
            key={part.key}
            section={part.section}
            items={part.items}
            offset={offsets[i]!}
            fit={fit}
            q={q}
            child={child}
            collapsible={mode === "meeting" && parts.length > 1}
            defaultOpen={i === 0}
            staffChildId={mode === "self" ? undefined : childId}
          />
        ))}
        {fit.pages > 1 && (
          <p className="tabular text-caption text-center text-ink-muted" data-testid="question-page">
            {t("wizard.pageOf", { current: fit.page + 1, total: fit.pages })}
          </p>
        )}
      </div>

      <WizardActions>
        <Button
          variant="ghost"
          icon={<ArrowLeft className="rtl:-scale-x-100" aria-hidden />}
          disabled={q.saving}
          onClick={() => (fit.hasPrev ? fit.prev() : current === 1 ? navigate(exitTo) : void go(current - 1))}
        >
          {t("common.back")}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={<Save aria-hidden />}
            aria-label={t("wizard.saveLater")}
            title={t("wizard.saveLater")}
            disabled={q.saving}
            onClick={async () => {
              if (await q.persist({ wizard_step: current, questionnaire: meetingPatch })) navigate(exitTo);
            }}
          >
            <SaveLaterLabel label={t("wizard.saveLater")} />
          </Button>
          {current < LAST_STEP || fit.hasNext ? (
            <Button loading={q.saving} onClick={() => (fit.hasNext ? fit.next() : void go(current + 1))} data-testid="questionnaire-next">
              {t("common.next")}
              <ArrowRight className="rtl:-scale-x-100" aria-hidden />
            </Button>
          ) : (
            <Button
              loading={q.saving}
              icon={<Send className="rtl:-scale-x-100" aria-hidden />}
              data-testid="questionnaire-send"
              onClick={async () => {
                const ok = await q.persist({ wizard_step: DONE_STEP, questionnaire: { ...(meetingPatch ?? {}), submit: true } });
                if (ok) navigate(pathFor(DONE_STEP));
              }}
            >
              {mode === "self" ? t("wizard.parent.send") : t("wizard.questionnaire.saveForFamily")}
            </Button>
          )}
        </div>
      </WizardActions>
    </div>
  );
}

function SectionCard({
  section,
  items,
  offset,
  fit,
  q,
  child,
  collapsible,
  defaultOpen,
  staffChildId,
}: {
  section: RegistrySection;
  items: RegistryItem[];
  offset: number;
  fit: ReturnType<typeof useFitPages>;
  q: QuestionnaireState;
  child: ChildBasics | undefined;
  collapsible: boolean;
  defaultOpen: boolean;
  /** Staff filling it in for the family or at a meeting set the section status (Review later, …). */
  staffChildId?: string;
}) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const [open, setOpen] = useState(defaultOpen);
  const ds = dataSection(section);
  const shown = items.map((_, i) => fit.visible(offset + i));
  const status = sectionStatus(q.data?.parent_perspective, ds);
  const notice = sm.label({ label: localized(section.notice) });
  const body = (
    <CardBody className="space-y-6 py-5">
      {notice && shown[0] && (
        <Alert tone="tip">
          <span className="inline-flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            {notice}
          </span>
        </Alert>
      )}
      {items.map((item, i) => (
        <div key={item.id} ref={fit.itemRef(offset + i)} hidden={!shown[i]}>
          <QuestionBlock item={item} section={ds} q={q} child={child} />
        </div>
      ))}
      {staffChildId && shown[shown.length - 1] && <SectionStatusControl childId={staffChildId} section={ds} value={status} onSaved={q.setData} />}
    </CardBody>
  );
  return (
    <Card data-section={section.key} hidden={!shown.some(Boolean)}>
      <CardHeader
        title={
          collapsible ? (
            <button type="button" className="flex min-h-11 items-center gap-2 text-start" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <ChevronDown className={cn("size-5 shrink-0 transition-transform", !open && "-rotate-90 rtl:rotate-90")} aria-hidden />
              {sm.label(section)}
            </button>
          ) : (
            sm.label(section)
          )
        }
        action={
          <span className="flex flex-wrap items-center gap-1.5">
            {section.private === true && (
              <Badge tone="outline" icon={<Lock aria-hidden />}>
                {t("wizard.questionnaire.private")}
              </Badge>
            )}
            <StatusPill status={status} wording="answers" />
          </span>
        }
      />
      {(!collapsible || open) && body}
    </Card>
  );
}

function QuestionBlock({ item, section, q, child }: { item: RegistryItem; section: string; q: QuestionnaireState; child: ChildBasics | undefined }) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const data = q.answersOf(section);
  if (!isShown(item, data)) return null;
  const field = fieldOf(item);
  const skipped = q.isSkipped(section, field);
  const label = sm.label(item);
  const hint = sm.label({ label: localized(item.hint) });
  const notice = sm.label({ label: localized(item.notice) });
  const canSkip = item.kind !== "child_fact";
  return (
    <div data-question={item.id}>
      <Question
        label={
          <span className="inline-flex flex-wrap items-center gap-2">
            {label}
            {isPrivate(item) && item.sensitivity !== "health" && item.sensitivity !== "medical" && (
              <Badge tone="outline" icon={<Lock aria-hidden />}>
                {t("wizard.questionnaire.private")}
              </Badge>
            )}
          </span>
        }
        hint={hint || undefined}
      >
        {notice && <p className="text-caption text-ink-muted">{notice}</p>}
        {skipped ? (
          <div className="flex flex-wrap items-center gap-3">
            <NotAnswered />
            <Button variant="ghost" size="sm" onClick={() => q.setSkipped(section, field, false)}>
              {t("wizard.questionnaire.answer")}
            </Button>
          </div>
        ) : (
          <>
            <QuestionControl item={item} data={data} setField={(f, v) => q.setField(section, f, v)} child={child} />
            {canSkip && (
              <button
                type="button"
                className="text-caption min-h-11 font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
                onClick={() => q.setSkipped(section, field, true)}
              >
                {t("wizard.questionnaire.skip")}
              </button>
            )}
          </>
        )}
      </Question>
    </div>
  );
}

/** Meeting mode: when the meeting took place and who came (relations). */
function MeetingCard({ value, onChange, compact }: { value: Meeting | null; onChange: (m: Meeting) => void; compact: boolean }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { list, labelOf } = useOptions();
  const date = value?.date ?? "";
  const attendees = value?.attendees ?? [];
  const [open, setOpen] = useState(!compact);
  return (
    <Card className="bg-brand-soft/40" data-testid="meeting-card">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Users className="size-5" aria-hidden />
            {t("wizard.questionnaire.meetingBanner")}
          </p>
          {compact && (
            <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? t("common.showLess") : t("common.details")}
            </Button>
          )}
        </div>
        {compact && !open && date && (
          <p className="text-caption text-ink-muted">
            <bdi className="tabular">{formatDate(date)}</bdi>
            {attendees.length > 0 && ` · ${attendees.map((a) => labelOf(list("relations").find((o) => o.key === a) ?? { key: a, label: {} })).join(", ")}`}
          </p>
        )}
        {open && (
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("wizard.questionnaire.meetingDate")}</span>
              <Input type="date" dir="ltr" value={date ?? ""} onChange={(e) => onChange({ date: e.target.value || null, attendees })} />
            </label>
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-ink">{t("wizard.questionnaire.meetingAttendees")}</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("wizard.questionnaire.meetingAttendees")}>
                {list("relations").map((o) => (
                  <ToggleChip
                    key={o.key}
                    selected={attendees.includes(o.key)}
                    onToggle={() =>
                      onChange({ date: date || null, attendees: attendees.includes(o.key) ? attendees.filter((k) => k !== o.key) : [...attendees, o.key] })
                    }
                  >
                    {labelOf(o)}
                  </ToggleChip>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Done({ mode, sent, name, reviewTo, exitTo }: { mode: EntryMode; sent: boolean; name: string; reviewTo: string; exitTo: string }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl space-y-5" data-step="done">
      <Card>
        <CardBody className="space-y-4 py-8 text-center">
          <ParentHomeIcon className="mx-auto size-16" aria-hidden />
          <h1 className="font-display text-display-lg font-semibold text-ink">
            {mode === "self" ? t("wizard.parent.doneTitle") : t("wizard.questionnaire.staffDoneTitle")}
          </h1>
          <p className="text-ink-muted">{mode === "self" ? t("wizard.parent.doneIntro") : t("wizard.questionnaire.staffDoneIntro", { name })}</p>
          {sent && (
            <p className="inline-flex items-center gap-2 rounded-md border-[1.5px] border-success px-3 py-1.5 text-sm font-semibold text-success">
              <Check className="size-4" strokeWidth={2.5} aria-hidden />
              {t("wizard.parent.alreadySent")}
            </p>
          )}
        </CardBody>
      </Card>
      <WizardActions>
        <ButtonLink variant="ghost" to={reviewTo}>
          {t("wizard.questionnaire.reviewAnswers")}
        </ButtonLink>
        <ButtonLink to={exitTo}>{mode === "self" ? t("wizard.questionnaire.backHome") : t("wizard.questionnaire.backToParentView")}</ButtonLink>
      </WizardActions>
    </div>
  );
}

export const isRecordSubmitted = (v: unknown) => isObj(v) && str(v.status) === "submitted";

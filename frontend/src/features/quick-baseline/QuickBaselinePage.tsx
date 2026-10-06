import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ClipboardCheck, Plus, Save, X } from "lucide-react";
import { StatusPicker, type SectionStatus } from "@/components/source";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { NumeralBlock, ToggleChip } from "@/components/ui/Chip";
import { Input, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Spinner";
import type { ChildBasics } from "@/features/wizard/api";
import { Question, SingleField } from "@/features/wizard/fields";
import {
  AnswerView,
  QUESTIONNAIRE,
  dataSection,
  isObj,
  localized,
  patchProfile,
  profileUrl,
  str,
  type QProfile,
  type SectionData,
} from "@/features/wizard/questionnaire";
import { StrengthsIcon } from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError } from "@/lib/api";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import type { RegistryItem } from "@/lib/sourceModel";
import { useSourceModel } from "@/lib/sourceModel";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";

const childUrl = (id: string) => `/api/children/${encodeURIComponent(id)}`;
/** The key parent answers the teacher reads first (§5.4: Q1, Q2, Q7, Q10, Q13, Q36, the heart message). */
const SUMMARY_IDS = ["PQ-INTRO-05", "PQ-INTRO-06", "PQ-JOY-04", "PQ-EMO-04", "PQ-SEP-01", "PQ-EXP-01", "PQ-HRT-01"];
const STATUS_CHOICES: SectionStatus[] = ["in_progress", "sufficient", "review_later"];
const NOTE_MAX = 300;

type Slot = { key?: string; custom?: string; note?: string };
type Help = { key?: string; custom?: string; list?: "calming_helps" | "what_helps" };

const slotId = (s: Slot) => (s.key ? `k:${s.key}` : `c:${(s.custom ?? "").trim().toLowerCase()}`);

/** /children/:id/quick-baseline — the teacher's part after reading the family's answers (QB, one screen). */
export function QuickBaselinePage() {
  const { id = "" } = useParams();
  return <QuickBaseline key={id} childId={id} />;
}

function QuickBaseline({ childId }: { childId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const sm = useSourceModel();
  const profile = useFetch<QProfile>(profileUrl(childId));
  const child = useFetch<{ child: ChildBasics }>(childUrl(childId));
  const [form, setForm] = useState<SectionData | null>(null);
  const [status, setStatus] = useState<SectionStatus | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useAction();
  const reg = sm.registry(QUESTIONNAIRE);

  if (profile.error && !profile.data) return <Alert tone="error">{t("quickBaseline.loadError")}</Alert>;
  if (!profile.data || (!sm.ready && !sm.error)) return <PageSkeleton />;

  const stored = profile.data.teacher_perspective?.sections?.bridge ?? {};
  const data = form ?? stored;
  const storedStatus = profile.data.section_status?.teacher?.bridge?.status as SectionStatus | undefined;
  const currentStatus = status ?? storedStatus ?? "in_progress";
  const strengths = (Array.isArray(data.main_strengths) ? data.main_strengths : []) as Slot[];
  const name = child.data?.child ? child.data.child.preferred_name?.trim() || child.data.child.name.split(" ")[0] : t("quickBaseline.theChild");
  const item = (id: string) => reg?.items.find((i) => i.id === id);
  const label = (id: string) => sm.label(item(id));
  const setField = (field: string, value: unknown) => {
    setSaved(false);
    setForm((prev) => {
      const next = { ...(prev ?? stored) };
      if (value === undefined) delete next[field];
      else next[field] = value;
      return next;
    });
  };
  const rememberCount = (Array.isArray(data.remember) ? data.remember : []).filter((l) => isObj(l) && str(l.text).trim()).length;
  // The bridge is exactly 3 + 3 (PQ-TCH-03): three main strengths and three things to remember.
  const needsThree = currentStatus === "sufficient" && strengths.length !== 3;
  const needsThreeRemember = currentStatus === "sufficient" && rememberCount !== 3;

  async function save() {
    setError(null);
    const body = { perspective: "teacher" as const, section: "bridge", data, status: currentStatus };
    const r = await run(() => patchProfile(childId, body), { errorToast: false, success: t("quickBaseline.saved") });
    if (r.ok) {
      profile.setData(r.data);
      setForm(null);
      setStatus(null);
      setSaved(true);
    } else {
      const e = r.error;
      const onRemember = e instanceof ApiError && Array.isArray(e.details) && e.details.some((d) => isObj(d) && d.path === "data.remember");
      setError(
        e instanceof ApiError && e.code === "VALIDATION"
          ? t(onRemember ? "quickBaseline.exactlyThreeRemember" : "quickBaseline.exactlyThree")
          : e instanceof ApiError
            ? e.message
            : String(e),
      );
    }
  }

  async function createBaseline() {
    const r = await run(() => api(`/api/children/${encodeURIComponent(childId)}/baseline`, { method: "POST" }), {
      success: t("quickBaseline.baselineCreated"),
    });
    if (r.ok) navigate(paths.child(childId));
  }

  const parentSections = profile.data.parent_perspective.sections;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ to: paths.child(childId), label: t("quickBaseline.back") }}
        icon={<ClipboardCheck />}
        title={t("quickBaseline.title")}
        description={t("quickBaseline.intro", { name })}
      />
      {reg?.meta?.motto ? (
        <p className="-mt-3 mb-6 text-sm text-ink-muted italic" dir="auto">
          {sm.label({ label: localized(reg.meta.motto) })}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="self-start" data-testid="family-summary">
          <CardHeader title={t("quickBaseline.familySaid")} description={t("quickBaseline.familySaidHint")} />
          <CardBody>
            <dl className="space-y-4">
              {SUMMARY_IDS.map((id) => {
                const it = item(id);
                if (!it) return null;
                const section = sm.section(QUESTIONNAIRE, it.section);
                return (
                  <div key={id} data-summary={id}>
                    <dt className="text-sm font-semibold text-ink-muted" dir="auto">
                      {sm.label(it)}
                    </dt>
                    <dd className="mt-1">
                      <AnswerView item={it} data={parentSections[dataSection(section)] ?? {}} child={child.data?.child} />
                    </dd>
                  </div>
                );
              })}
            </dl>
            <ButtonLink className="mt-5" variant="ghost" size="sm" to={paths.childParentView(childId)}>
              {t("quickBaseline.allAnswers")}
            </ButtonLink>
          </CardBody>
        </Card>

        <Card data-testid="quick-baseline-form">
          <CardBody className="space-y-8 py-6">
            <Question label={label("PQ-TCH-02")} hint={t("quickBaseline.strengthsHint")}>
              <StrengthSlots value={strengths} onChange={(v) => setField("main_strengths", v.length ? v : undefined)} profile={profile.data} />
            </Question>
            <Question label={label("PQ-TCH-03")}>
              <RememberLines value={data.remember} onChange={(v) => setField("remember", v)} />
            </Question>
            <Question label={label("PQ-TCH-04")}>
              <CalmsHelps value={data.calms_helps} onChange={(v) => setField("calms_helps", v)} />
            </Question>
            <Question label={label("PQ-TCH-05")} hint={t("quickBaseline.difficultHint")}>
              <Textarea
                rows={2}
                maxLength={4000}
                aria-label={label("PQ-TCH-05")}
                value={str(data.may_be_difficult)}
                onChange={(e) => setField("may_be_difficult", e.target.value || undefined)}
              />
            </Question>
            <Question label={label("PQ-TCH-06")} hint={t("quickBaseline.firstAreaHint")}>
              <FirstArea value={data.first_area_to_observe} onChange={(v) => setField("first_area_to_observe", v)} item={item("PQ-TCH-06")} />
            </Question>
            <Question label={label("PQ-TCH-07")} hint={t("quickBaseline.questionHint")}>
              <QuestionForFamily value={data.question_for_parent} onChange={(v) => setField("question_for_parent", v)} />
            </Question>
            <Question label={t("quickBaseline.status")} hint={t("quickBaseline.statusHint")}>
              <StatusPicker value={currentStatus} options={STATUS_CHOICES} wording="answers" onChange={(s) => setStatus(s)} />
            </Question>
            {needsThree && <Alert tone="warning">{t("quickBaseline.exactlyThree")}</Alert>}
            {needsThreeRemember && <Alert tone="warning">{t("quickBaseline.exactlyThreeRemember")}</Alert>}
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-wrap items-center gap-2">
              <Button loading={pending} disabled={needsThree || needsThreeRemember} icon={<Save aria-hidden />} onClick={() => void save()} data-testid="qb-save">
                {t("common.save")}
              </Button>
            </div>
            {saved && (
              <Alert
                tone="success"
                action={
                  <Button size="sm" icon={<ClipboardCheck aria-hidden />} loading={pending} onClick={() => void createBaseline()} data-testid="qb-create-baseline">
                    {profile.data.has_baseline ? t("quickBaseline.createNewBaseline") : t("quickBaseline.createBaseline")}
                  </Button>
                }
              >
                {t("quickBaseline.savedHint")}
              </Alert>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/** Exactly 3 main strengths: suggestions from the family's answers first, then every strength, or the teacher's own words. */
function StrengthSlots({ value, onChange, profile }: { value: Slot[]; onChange: (v: Slot[]) => void; profile: QProfile }) {
  const { t } = useI18n();
  const { list, labelOf, optionLabel } = useOptions();
  const [draft, setDraft] = useState("");
  const chosen = new Set(value.map(slotId));
  const full = value.length >= 3;
  const who = profile.parent_perspective.sections.who ?? {};
  const joy = profile.parent_perspective.sections.joy ?? {};
  const fromFamily = [
    ...(Array.isArray(who.strengths) ? who.strengths : []).map((s) => (isObj(s) ? str(s.key) : str(s))),
    ...(isObj(joy.special_ability) && Array.isArray(joy.special_ability.strength_keys) ? (joy.special_ability.strength_keys as string[]) : []),
  ].filter((k, i, all) => k && all.indexOf(k) === i);
  const toggle = (slot: Slot) => {
    if (chosen.has(slotId(slot))) onChange(value.filter((s) => slotId(s) !== slotId(slot)));
    else if (!full) onChange([...value, slot]);
  };
  const setNote = (i: number, note: string) => onChange(value.map((s, j) => (j === i ? { ...s, note: note || undefined } : s)));
  return (
    <div className="space-y-4">
      <ol className="space-y-2" aria-label={t("quickBaseline.slots")}>
        {[0, 1, 2].map((i) => {
          const slot = value[i];
          return (
            <li key={i} className={cn("flex flex-wrap items-center gap-2 rounded-md px-3 py-2", slot ? "bg-strength-soft" : "border-[1.5px] border-dashed border-line-strong")}>
              <NumeralBlock n={i + 1} />
              {slot ? (
                <>
                  <span className="font-semibold text-ink" dir="auto">
                    {slot.key ? optionLabel("strengths", slot.key) : slot.custom}
                  </span>
                  <Input
                    className="h-10 min-w-40 flex-1"
                    dir="auto"
                    maxLength={NOTE_MAX}
                    value={slot.note ?? ""}
                    placeholder={t("quickBaseline.notePlaceholder")}
                    aria-label={t("quickBaseline.notePlaceholder")}
                    onChange={(e) => setNote(i, e.target.value)}
                  />
                  <IconButton size="sm" label={t("common.remove")} onClick={() => toggle(slot)}>
                    <X aria-hidden />
                  </IconButton>
                </>
              ) : (
                <span className="text-sm text-ink-muted">{t("quickBaseline.emptySlot")}</span>
              )}
            </li>
          );
        })}
      </ol>
      {fromFamily.length > 0 && (
        <div className="space-y-2">
          <p className="text-caption font-semibold text-ink-muted">{t("quickBaseline.fromFamily")}</p>
          <div className="flex flex-wrap gap-2">
            {fromFamily.map((k) => (
              <ToggleChip
                key={k}
                tone="strength"
                icon={<StrengthsIcon size={16} />}
                selected={chosen.has(`k:${k}`)}
                disabled={full && !chosen.has(`k:${k}`)}
                onToggle={() => toggle({ key: k })}
              >
                {optionLabel("strengths", k)}
              </ToggleChip>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {list("strengths")
          .filter((o) => !fromFamily.includes(o.key))
          .map((o) => (
            <ToggleChip key={o.key} tone="strength" icon={o.icon} selected={chosen.has(`k:${o.key}`)} disabled={full && !chosen.has(`k:${o.key}`)} onToggle={() => toggle({ key: o.key })}>
              {labelOf(o)}
            </ToggleChip>
          ))}
      </div>
      <div className="flex gap-2">
        <Input dir="auto" value={draft} maxLength={120} disabled={full} placeholder={t("quickBaseline.ownStrength")} aria-label={t("quickBaseline.ownStrength")} onChange={(e) => setDraft(e.target.value)} />
        <Button
          variant="secondary"
          icon={<Plus aria-hidden />}
          disabled={!draft.trim() || full}
          onClick={() => {
            toggle({ custom: draft.trim() });
            setDraft("");
          }}
        >
          {t("common.add")}
        </Button>
      </div>
    </div>
  );
}

function RememberLines({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const { t } = useI18n();
  // The three inputs keep what the teacher typed, blanks included, so a line never jumps to
  // another input while she is typing; only the saved value drops the blank lines.
  const [shown, setShown] = useState<string[]>(() => {
    const lines = (Array.isArray(value) ? value : []).map((l) => (isObj(l) ? str(l.text) : ""));
    return [0, 1, 2].map((i) => lines[i] ?? "");
  });
  const emit = (next: string[]) => {
    setShown(next);
    const clean = next.filter((x) => x.trim()).map((text) => ({ text }));
    onChange(clean.length ? clean : undefined);
  };
  return (
    <div className="space-y-2">
      {shown.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <NumeralBlock n={i + 1} />
          <Input
            dir="auto"
            maxLength={NOTE_MAX}
            value={line}
            aria-label={t("quickBaseline.rememberLine", { n: i + 1 })}
            onChange={(e) => emit(shown.map((x, j) => (j === i ? e.target.value : x)))}
          />
        </div>
      ))}
    </div>
  );
}

function CalmsHelps({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const { t } = useI18n();
  const { list, labelOf } = useOptions();
  const v = isObj(value) ? value : {};
  const items = (Array.isArray(v.items) ? v.items : []) as Help[];
  const has = (listName: string, key: string) => items.some((i) => i.key === key && (i.list ?? listName) === listName);
  const emit = (patch: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...v, ...patch };
    if (Array.isArray(next.items) && !next.items.length) delete next.items;
    if (!str(next.text)) delete next.text;
    onChange(Object.keys(next).length ? next : undefined);
  };
  const toggle = (listName: "calming_helps" | "what_helps", key: string) =>
    emit({ items: has(listName, key) ? items.filter((i) => !(i.key === key && (i.list ?? listName) === listName)) : [...items, { key, list: listName }] });
  return (
    <div className="space-y-3">
      {(["calming_helps", "what_helps"] as const).map((listName) => (
        <div key={listName} className="flex flex-wrap gap-2" role="group" aria-label={t(`quickBaseline.helpLists.${listName}`)}>
          {list(listName)
            .filter((o) => o.key !== "other" && (listName === "calming_helps" || !list("calming_helps").some((c) => c.key === o.key)))
            .map((o) => (
              <ToggleChip key={`${listName}:${o.key}`} tone="helps" icon={o.icon} selected={has(listName, o.key)} onToggle={() => toggle(listName, o.key)}>
                {labelOf(o)}
              </ToggleChip>
            ))}
        </div>
      ))}
      <Textarea rows={2} maxLength={4000} aria-label={t("quickBaseline.helpsText")} placeholder={t("quickBaseline.helpsText")} value={str(v.text)} onChange={(e) => emit({ text: e.target.value })} />
    </div>
  );
}

function FirstArea({ value, onChange, item }: { value: unknown; onChange: (v: unknown) => void; item: RegistryItem | undefined }) {
  const { t } = useI18n();
  const v = isObj(value) ? value : {};
  const emit = (patch: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...v, ...patch };
    for (const k of Object.keys(next)) if (!str(next[k])) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="space-y-3">
      <SingleField list={typeof item?.options === "string" ? item.options : "observation_domains"} value={str(v.domain) || undefined} onChange={(d) => emit({ domain: d ?? "" })} />
      <Input dir="auto" maxLength={500} value={str(v.note)} placeholder={t("quickBaseline.firstAreaNote")} aria-label={t("quickBaseline.firstAreaNote")} onChange={(e) => emit({ note: e.target.value })} />
    </div>
  );
}

function QuestionForFamily({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const { t } = useI18n();
  const v = isObj(value) ? value : {};
  const status = str(v.status) || "open";
  const emit = (patch: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...v, ...patch };
    for (const k of ["text", "outcome_note"]) if (!str(next[k])) delete next[k];
    onChange(str(next.text) || str(next.outcome_note) ? next : undefined);
  };
  return (
    <div className="space-y-3">
      <Textarea rows={2} maxLength={1000} aria-label={t("quickBaseline.questionText")} value={str(v.text)} onChange={(e) => emit({ text: e.target.value })} />
      <SingleField list="qb_question_statuses" value={status} onChange={(s) => emit({ status: s ?? "open" })} />
      {status === "clarified" && (
        <Textarea rows={2} maxLength={1000} aria-label={t("quickBaseline.outcome")} placeholder={t("quickBaseline.outcome")} value={str(v.outcome_note)} onChange={(e) => emit({ outcome_note: e.target.value })} />
      )}
    </div>
  );
}

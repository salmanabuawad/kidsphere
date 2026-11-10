/**
 * Family journey on the child overview (staff): enrol the family in a published program, see this
 * week, what the parents shared week by week, add a short note of guidance for the family, create
 * this week's activity, and complete or stop the journey.
 */
import { useState } from "react";
import { Sprout } from "lucide-react";
import { Button, ButtonLink, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { pick } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { paths } from "@/lib/paths";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { addReflection, enrol, enrolmentsUrl, programsUrl, setEnrolmentStatus, type Enrolment, type Program } from "./api";
import { WeekView } from "./WeekView";

export function TeacherJourneyCard({ childId }: { childId: string }) {
  const { t, locale } = useI18n();
  const { data, setData, reload } = useFetch<{ enrolments: Enrolment[] }>(enrolmentsUrl(childId));
  const active = data?.enrolments.find((e) => e.status === "active");
  const replace = (e: Enrolment) => setData({ enrolments: (data?.enrolments ?? []).map((x) => (x.id === e.id ? e : x)) });
  if (!data) return null;
  return (
    <Card data-testid="teacher-journey">
      <CardHeader
        icon={<Sprout className="text-ink-muted" aria-hidden />}
        title={t("family.title")}
        description={active ? pick(active.program.title, locale) : t("family.subtitle")}
      />
      <CardBody className="space-y-5">
        {active ? <ActiveJourney enrolment={active} childId={childId} onChange={replace} onStatus={reload} /> : <EnrolForm childId={childId} onDone={reload} />}
        <ButtonLink size="sm" variant="ghost" to={paths.familyRoutines(childId)}>
          {t("family.routines.title")}
        </ButtonLink>
      </CardBody>
    </Card>
  );
}

function EnrolForm({ childId, onDone }: { childId: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const { pending, run } = useAction();
  const programs = useFetch<{ programs: Program[] }>(programsUrl).data?.programs ?? [];
  const [programId, setProgramId] = useState("");
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const chosen = programId || programs[0]?.id || "";
  if (programs.length === 0) return <p className="text-sm text-ink-muted">{t("family.noPrograms")}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <Field label={t("family.program")}>
        {(p) => (
          <Select {...p} value={chosen} onChange={(e) => setProgramId(e.target.value)}>
            {programs.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pick(pr.title, locale)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("family.startsOn")}>{(p) => <Input {...p} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
      <Button loading={pending} onClick={async () => (await run(() => enrol(childId, chosen, start), { success: t("family.enrolled") })).ok && onDone()}>
        {t("family.enrol")}
      </Button>
    </div>
  );
}

function ActiveJourney({ enrolment, childId, onChange, onStatus }: { enrolment: Enrolment; childId: string; onChange: (e: Enrolment) => void; onStatus: () => void }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { pending, run } = useAction();
  const [note, setNote] = useState("");
  const week = enrolment.current_week;
  const current = week > 0 ? enrolment.program.weeks[week - 1] : undefined;
  const parentAnswers = [...enrolment.reflections].filter((r) => r.author_role === "parent").reverse();

  async function sendNote() {
    const r = await run(() => addReflection(enrolment.id, { week: Math.max(week, 1), note: note.trim() }), { success: t("family.noteSaved") });
    if (r.ok) {
      setNote("");
      onChange(r.data.enrolment);
    }
  }
  async function setStatus(status: Enrolment["status"]) {
    if ((await run(() => setEnrolmentStatus(enrolment.id, status))).ok) onStatus();
  }

  return (
    <>
      {current ? (
        <>
          <WeekView week={current} n={week} total={enrolment.weeks_count} />
          <ButtonLink size="sm" variant="outline" to={paths.newContent(childId, { type: current.content_type })}>
            {t("family.createWeekActivity", { type: t(`content.types.${current.content_type}`) })}
          </ButtonLink>
        </>
      ) : (
        <p className="text-sm text-ink-muted">{t("family.notStarted", { date: enrolment.started_on })}</p>
      )}
      <div>
        <p className="text-sm font-semibold text-ink">{t("family.parentAnswers")}</p>
        {parentAnswers.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("family.noAnswersYet")}</p>
        ) : (
          <ul className="mt-1 space-y-1" data-testid="parent-answers">
            {parentAnswers.map((r) => (
              <li key={r.id} className="text-sm text-ink">
                <span className="font-semibold">{t("family.weekN", { n: r.week })}</span> · {r.result ? t(`content.results.${r.result}`) : ""}
                <span className="text-ink-muted"> · {formatDate(r.created_at)}</span>
                {r.note && (
                  <span className="block text-ink" dir="auto">
                    “{r.note}”
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Field label={t("family.guidanceLabel")} hint={t("family.guidanceHint")}>
        {(p) => <Textarea {...p} dir="auto" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={sendNote} disabled={!note.trim()} loading={pending}>
          {t("family.sendGuidance")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setStatus("completed")} disabled={pending}>
          {t("family.complete")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setStatus("stopped")} disabled={pending}>
          {t("family.stop")}
        </Button>
      </div>
    </>
  );
}

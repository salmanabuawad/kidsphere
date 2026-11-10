/**
 * The parent's journey for one child (inside the child card on /parent): this week's topic, a short
 * lesson, what to try at home, the activities the teacher shared, the teacher's guidance and the
 * week's reflection (one tap; the note is optional and only the teacher sees it).
 */
import { useState } from "react";
import { Link } from "react-router";
import { Sprout } from "lucide-react";
import { Button, Field, Textarea, ToggleChip } from "@/components/ui";
import { pick } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { paths } from "@/lib/paths";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { addReflection, enrolmentsUrl, type Enrolment, type WeekResult } from "./api";
import { WeekView } from "./WeekView";

const RESULTS: WeekResult[] = ["worked_well", "partly", "did_not_work"];

export function ParentJourneyCard({ childId }: { childId: string }) {
  const { t, locale } = useI18n();
  const { data, setData } = useFetch<{ enrolments: Enrolment[] }>(enrolmentsUrl(childId));
  const active = data?.enrolments.find((e) => e.status === "active");
  if (!active) return null;
  const replace = (e: Enrolment) => setData({ enrolments: (data?.enrolments ?? []).map((x) => (x.id === e.id ? e : x)) });
  return (
    <section className="space-y-4 rounded-lg border border-line p-4" data-testid="parent-journey">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Sprout className="size-4" aria-hidden />
        <span dir="auto">{pick(active.program.title, locale)}</span>
      </p>
      {active.current_week === 0 ? (
        <p className="text-sm text-ink-muted">{t("family.notStarted", { date: active.started_on })}</p>
      ) : (
        <>
          <WeekView week={active.program.weeks[active.current_week - 1]!} n={active.current_week} total={active.weeks_count} />
          <TeacherNotes enrolment={active} week={active.current_week} />
          {active.shared_content.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-ink">{t("family.sharedForYou")}</p>
              <ul className="mt-1 space-y-1">
                {active.shared_content.slice(0, 4).map((c) => (
                  <li key={c.id}>
                    <Link to={paths.parentContent(c.id)} dir="auto" className="text-sm font-medium text-ink underline underline-offset-2">
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <WeekReflectionForm enrolment={active} onSaved={replace} />
        </>
      )}
    </section>
  );
}

function TeacherNotes({ enrolment, week }: { enrolment: Enrolment; week: number }) {
  const { t } = useI18n();
  const notes = enrolment.reflections.filter((r) => r.author_role === "teacher" && r.week === week && r.note);
  if (notes.length === 0) return null;
  return (
    <div className="rounded-md bg-focus-soft p-3" data-testid="teacher-guidance">
      <p className="text-sm font-semibold text-ink">{t("family.fromTeacher")}</p>
      {notes.map((n) => (
        <p key={n.id} className="mt-1 text-ink" dir="auto">
          {n.note}
        </p>
      ))}
    </div>
  );
}

function WeekReflectionForm({ enrolment, onSaved }: { enrolment: Enrolment; onSaved: (e: Enrolment) => void }) {
  const { t, locale } = useI18n();
  const { pending, run } = useAction();
  const [result, setResult] = useState<WeekResult | null>(null);
  const [note, setNote] = useState("");
  const week = enrolment.current_week;
  const question = pick(enrolment.program.weeks[week - 1]?.reflection ?? {}, locale);
  const answered = enrolment.reflections.some((r) => r.author_role === "parent" && r.week === week);

  async function save() {
    if (!result) return;
    const r = await run(() => addReflection(enrolment.id, { week, result, note: note.trim() || null }), { success: t("family.reflectionSaved") });
    if (r.ok) {
      setResult(null);
      setNote("");
      onSaved(r.data.enrolment);
    }
  }

  return (
    <div className="space-y-3" data-testid="week-reflection">
      <p className="font-semibold text-ink" dir="auto">
        {question || t("family.howWasTheWeek")}
      </p>
      {answered && <p className="text-sm text-ink-muted">{t("family.alreadyShared")}</p>}
      <div role="radiogroup" aria-label={t("family.howWasTheWeek")} className="flex flex-wrap gap-2">
        {RESULTS.map((r) => (
          <ToggleChip key={r} single selected={result === r} onToggle={() => setResult(r)}>
            {t(`content.results.${r}`)}
          </ToggleChip>
        ))}
      </div>
      <Field label={`${t("family.noteLabel")} (${t("common.optional")})`} hint={t("family.noteHint")}>
        {(p) => <Textarea {...p} dir="auto" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <Button onClick={save} disabled={!result} loading={pending}>
        {t("family.sendReflection")}
      </Button>
    </div>
  );
}

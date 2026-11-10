/** The parent's short questionnaire at the start or the end of a journey (descriptive, never scored). */
import { useState } from "react";
import { Button, ToggleChip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";

type Question = { key: string; text: string; options: { key: string; label: string }[] };

export function QuestionnaireForm({ enrolmentId, kind, onDone }: { enrolmentId: string; kind: "baseline" | "end"; onDone: () => void }) {
  const { t, locale } = useI18n();
  const { run, pending } = useAction();
  const questions = useFetch<{ questions: Question[] }>(`/api/family-questionnaire?language=${locale}`).data?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = questions.length > 0 && questions.every((q) => answers[q.key]);

  async function send() {
    const r = await run(() => api(`/api/family-enrolments/${encodeURIComponent(enrolmentId)}/questionnaire`, { method: "POST", body: { kind, answers } }), {
      success: t("family.questionnaire.thanks"),
    });
    if (r.ok) onDone();
  }

  if (questions.length === 0) return null;
  return (
    <div className="space-y-3 rounded-md bg-tray p-3" data-testid={`questionnaire-${kind}`}>
      <p className="font-semibold text-ink">{t(kind === "baseline" ? "family.questionnaire.startTitle" : "family.questionnaire.endTitle")}</p>
      <p className="text-caption text-ink-muted">{t("family.questionnaire.hint")}</p>
      {questions.map((q) => (
        <div key={q.key} role="radiogroup" aria-label={q.text}>
          <p className="mb-1 text-sm text-ink">{q.text}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => (
              <ToggleChip key={o.key} single selected={answers[q.key] === o.key} onToggle={() => setAnswers((a) => ({ ...a, [q.key]: o.key }))}>
                {o.label}
              </ToggleChip>
            ))}
          </div>
        </div>
      ))}
      <Button size="sm" onClick={send} disabled={!complete} loading={pending}>
        {t("family.questionnaire.send")}
      </Button>
    </div>
  );
}

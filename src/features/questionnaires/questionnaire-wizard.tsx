"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Chip, Input, Textarea } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { QUESTIONNAIRE, type Question } from "./definition";
import { AnswerView } from "./answer-view";

type Answers = Record<string, unknown>;
type Multi = { selected: string[]; other: string | null };

export function QuestionnaireWizard({
  childId,
  initialAnswers,
  initialSection,
  submitted,
  header,
}: {
  childId: string;
  initialAnswers: Answers;
  initialSection: string | null;
  submitted: boolean;
  header: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { pending, run } = useAction();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const startIndex = Math.max(
    0,
    QUESTIONNAIRE.findIndex((s) => s.key === initialSection),
  );
  const [step, setStep] = useState(submitted ? QUESTIONNAIRE.length : startIndex);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const total = QUESTIONNAIRE.length;
  const reviewing = step >= total;
  const section = QUESTIONNAIRE[Math.min(step, total - 1)]!;

  const set = (key: string, value: unknown) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    setDirtyKeys((d) => new Set(d).add(key));
  };

  async function persist(nextSection: string | undefined, submit = false) {
    const payload: Answers = {};
    for (const k of dirtyKeys) payload[k] = answers[k] ?? "";
    const ok = await run(() => api(`/api/children/${childId}/parent-questionnaires`, { body: { answers: payload, currentSection: nextSection, submit } }), {
      success: submit ? t("parent.questionnaire.submitted") : t("parent.questionnaire.autosaved"),
      refresh: false,
    });
    if (ok) setDirtyKeys(new Set());
    return !!ok;
  }

  const progress = useMemo(() => Math.round((Math.min(step, total) / total) * 100), [step, total]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-muted text-sm">{header}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="bg-brand h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        {!reviewing && <p className="text-muted mt-1 text-xs">{t("parent.questionnaire.progress", { current: step + 1, total })}</p>}
      </div>

      {!reviewing ? (
        <Card className="space-y-6 p-5" data-testid={`section-${section.key}`}>
          <h2 className="text-xl font-semibold">{section.title[locale]}</h2>
          {section.intro && <Alert tone="info">{section.intro[locale]}</Alert>}
          {section.questions.map((q) => (
            <QuestionField key={q.key} question={q} value={answers[q.key]} onChange={(v) => set(q.key, v)} />
          ))}
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">{t("parent.questionnaire.review")}</h2>
          {submitted && <Alert tone="success">{t("parent.child.questionnaireDone")}</Alert>}
          {QUESTIONNAIRE.map((s, i) => {
            const answered = s.questions.filter((q) => answers[q.key] !== undefined && answers[q.key] !== "");
            return (
              <Card key={s.key} className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{s.title[locale]}</h3>
                  <Button size="sm" variant="ghost" onClick={() => setStep(i)}>
                    {t("common.edit")}
                  </Button>
                </div>
                {answered.length > 0 && (
                  <dl className="mt-2 space-y-2">
                    {answered.map((q) => (
                      <div key={q.key}>
                        <dt className="text-muted text-xs">{q.label[locale]}</dt>
                        <dd className="text-sm">
                          <AnswerView question={q} value={answers[q.key]} locale={locale} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <div className="border-line sticky bottom-20 z-10 flex flex-wrap justify-between gap-2 rounded-2xl border bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-4">
        <Button variant="ghost" disabled={step === 0 || pending} onClick={() => setStep(step - 1)}>
          {t("common.previous")}
        </Button>
        <div className="flex gap-2">
          {!reviewing && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={async () => {
                if (await persist(section.key)) router.push(`/parent/children/${childId}`);
              }}
            >
              {t("parent.questionnaire.saveExit")}
            </Button>
          )}
          {!reviewing ? (
            <Button
              loading={pending}
              data-testid="q-next"
              onClick={async () => {
                const next = QUESTIONNAIRE[step + 1]?.key;
                if (await persist(next ?? section.key)) setStep(step + 1);
              }}
            >
              {t("parent.questionnaire.saveContinue")}
            </Button>
          ) : (
            <Button
              loading={pending}
              data-testid="q-submit"
              onClick={async () => {
                if (await persist(undefined, true)) {
                  router.push(`/parent/children/${childId}`);
                  router.refresh();
                }
              }}
            >
              <Check className="size-4" />
              {t("parent.questionnaire.submit")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionField({ question: q, value, onChange }: { question: Question; value: unknown; onChange: (v: unknown) => void }) {
  const { t, locale } = useI18n();
  const id = `q-${q.key}`;
  const sensitive = "sensitive" in q && q.sensitive;
  const label = (
    <span className="flex items-center gap-2">
      {q.label[locale]}
      {sensitive && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
          <Lock className="size-3" />
          {t("parent.questionnaire.sensitive")}
        </span>
      )}
    </span>
  );

  if (q.type === "text" || q.type === "textarea") {
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        {q.type === "text" ? (
          <Input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <Textarea id={id} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
        )}
      </div>
    );
  }

  if (q.type === "single") {
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{label}</legend>
        <div className="flex flex-wrap gap-2">
          {q.options.map((o) => (
            <Chip key={o.key} selected={value === o.key} onClick={() => onChange(value === o.key ? "" : o.key)}>
              {o.label[locale]}
            </Chip>
          ))}
        </div>
      </fieldset>
    );
  }

  if (q.type === "multi") {
    const v = (value as Multi | undefined) ?? { selected: [], other: null };
    const toggle = (k: string) => onChange({ ...v, selected: v.selected.includes(k) ? v.selected.filter((x) => x !== k) : [...v.selected, k] });
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{label}</legend>
        <div className="flex flex-wrap gap-2">
          {q.options.map((o) => (
            <Chip key={o.key} selected={v.selected.includes(o.key)} onClick={() => toggle(o.key)}>
              {o.emoji && <span aria-hidden>{o.emoji}</span>}
              {o.label[locale]}
            </Chip>
          ))}
          {q.allowOther && (
            <Chip selected={v.selected.includes("other")} onClick={() => toggle("other")}>
              {t("common.more")}…
            </Chip>
          )}
        </div>
        {q.allowOther && v.selected.includes("other") && (
          <Input
            className="mt-2"
            aria-label={t("parent.questionnaire.otherPlaceholder")}
            placeholder={t("parent.questionnaire.otherPlaceholder")}
            value={v.other ?? ""}
            onChange={(e) => onChange({ ...v, other: e.target.value })}
          />
        )}
      </fieldset>
    );
  }

  if (q.type !== "grid") return null;
  const gq = q;
  const grid = (value as Record<string, string> | undefined) ?? {};
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="divide-line border-line divide-y rounded-xl border">
        {gq.rows.map((r) => (
          <div key={r.key} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">{r.label[locale]}</span>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={r.label[locale]}>
              {gq.levels.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  role="radio"
                  aria-checked={grid[r.key] === l.key}
                  onClick={() => onChange({ ...grid, [r.key]: l.key })}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs",
                    grid[r.key] === l.key ? "border-brand bg-brand text-white" : "border-line hover:bg-stone-50",
                  )}
                >
                  {l.label[locale]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

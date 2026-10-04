"use client";

import type { AttributeCategory, DevelopmentDomain } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { vocabLabel } from "@/features/child-understanding/vocabulary";
import { DOMAINS } from "@/features/observations/definition";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function GoalForm({ childId, evidenceOptions }: { childId: string; evidenceOptions: { id: string; category: AttributeCategory; value: string }[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { pending, run } = useAction();
  const [domain, setDomain] = useState<DevelopmentDomain>("ATTENTION_EF");
  const [statement, setStatement] = useState("");
  const [indicator, setIndicator] = useState("");
  const [start, setStart] = useState(() => iso(new Date()));
  const [review, setReview] = useState(() => iso(new Date(Date.now() + 21 * 86_400_000)));
  const [share, setShare] = useState(false);
  const [parentFocus, setParentFocus] = useState("");
  const [reinforcement, setReinforcement] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () =>
        api(`/api/children/${childId}/goals`, {
          body: {
            domain,
            statement,
            successIndicator: indicator,
            startDate: start,
            reviewDate: review,
            shareWithParent: share,
            parentFocus: share ? parentFocus || null : null,
            parentReinforcement: share ? reinforcement || null : null,
            evidenceAttributeIds: evidence,
          },
        }),
      { success: t("teacher.goals.created"), refresh: false },
    );
    if (ok) {
      router.push(`/teacher/children/${childId}/goals`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Alert tone="info">{t("teacher.goals.noDiagnosis")}</Alert>
      <Card className="space-y-4 p-5">
        <Field label={t("teacher.goals.domain")} required>
          {(p) => (
            <Select {...p} value={domain} onChange={(e) => setDomain(e.target.value as DevelopmentDomain)}>
              {DOMAINS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label[locale]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("teacher.goals.statement")} hint={t("teacher.goals.statementHint")} required>
          {(p) => <Textarea {...p} rows={2} value={statement} onChange={(e) => setStatement(e.target.value)} data-testid="goal-statement" />}
        </Field>
        <Field label={t("teacher.goals.indicator")} hint={t("teacher.goals.indicatorHint")} required>
          {(p) => <Input {...p} value={indicator} onChange={(e) => setIndicator(e.target.value)} data-testid="goal-indicator" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("teacher.goals.startDate")} required>
            {(p) => <Input {...p} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}
          </Field>
          <Field label={t("teacher.goals.reviewDate")} required>
            {(p) => <Input {...p} type="date" value={review} onChange={(e) => setReview(e.target.value)} />}
          </Field>
        </div>
      </Card>

      {evidenceOptions.length > 0 && (
        <Card className="p-5">
          <p className="text-sm font-medium">{t("teacher.goals.evidence")}</p>
          <p className="text-muted mb-3 text-xs">{t("teacher.goals.evidenceHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {evidenceOptions.map((o) => (
              <Checkbox
                key={o.id}
                checked={evidence.includes(o.id)}
                onChange={(e) => setEvidence(e.target.checked ? [...evidence, o.id] : evidence.filter((x) => x !== o.id))}
                label={
                  <span>
                    <span className="text-muted">{t(`enums.category.${o.category}` as MessageKey)}:</span> {vocabLabel(o.category, o.value, locale)}
                  </span>
                }
              />
            ))}
          </div>
        </Card>
      )}

      <Card className="space-y-4 p-5">
        <Checkbox checked={share} onChange={(e) => setShare(e.target.checked)} label={t("teacher.goals.shareWithParent")} />
        {share && (
          <>
            <Field label={t("teacher.goals.parentFocus")} hint={t("teacher.goals.parentFocusHint")}>
              {(p) => <Input {...p} value={parentFocus} onChange={(e) => setParentFocus(e.target.value)} />}
            </Field>
            <Field label={t("teacher.goals.parentReinforcement")}>
              {(p) => <Textarea {...p} value={reinforcement} onChange={(e) => setReinforcement(e.target.value)} />}
            </Field>
          </>
        )}
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" loading={pending} disabled={statement.trim().length < 5 || indicator.trim().length < 5} data-testid="create-goal">
          {t("teacher.goals.create")}
        </Button>
      </div>
    </form>
  );
}

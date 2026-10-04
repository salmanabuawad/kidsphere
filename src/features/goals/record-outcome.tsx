"use client";

import type { ObservationContext, OutcomeResult } from "@prisma/client";
import { useRef, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { SUPPORTS } from "@/features/child-understanding/vocabulary";
import { CONTEXTS } from "@/features/observations/definition";
import { newRequestId } from "@/features/observations/shared";

const RESULTS: { key: OutcomeResult; emoji: string }[] = [
  { key: "HELPED", emoji: "🌟" },
  { key: "PARTLY_HELPED", emoji: "🌤️" },
  { key: "DID_NOT_HELP", emoji: "🌧️" },
  { key: "NOT_OBSERVED", emoji: "⏸️" },
];

export function RecordOutcomeButton({
  goalId,
  contentId,
  size = "sm",
  variant = "outline",
}: {
  goalId: string;
  contentId?: string;
  size?: "sm" | "md";
  variant?: "outline" | "primary" | "soft";
}) {
  const { t, locale } = useI18n();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<OutcomeResult | null>(null);
  const [context, setContext] = useState<ObservationContext | "">("");
  const [support, setSupport] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const requestId = useRef(newRequestId());

  async function save() {
    if (!result) return;
    const ok = await run(
      () =>
        api(`/api/goals/${goalId}/outcomes`, {
          body: {
            result,
            contentId: contentId ?? null,
            support: support || null,
            context: context || null,
            durationMinutes: duration ? Number(duration) : null,
            note: note || null,
            clientRequestId: requestId.current,
          },
        }),
      { success: t("teacher.outcome.saved") },
    );
    if (ok) {
      setOpen(false);
      setResult(null);
      setNote("");
      requestId.current = newRequestId();
    }
  }

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} data-testid="record-outcome">
        <ClipboardCheck className="size-4" />
        {t("teacher.goals.recordOutcome")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("teacher.outcome.title")}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save} disabled={!result} loading={pending} data-testid="save-outcome">
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t("teacher.outcome.result")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {RESULTS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={result === r.key}
                  onClick={() => setResult(r.key)}
                  data-testid={`result-${r.key}`}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-3 text-sm",
                    result === r.key ? "border-brand bg-brand/10 text-brand font-medium" : "border-line hover:bg-stone-50",
                  )}
                >
                  <span aria-hidden>{r.emoji}</span>
                  {t(`enums.outcome.${r.key}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("teacher.outcome.context")}>
              {(p) => (
                <Select {...p} value={context} onChange={(e) => setContext(e.target.value as ObservationContext)}>
                  <option value="">—</option>
                  {CONTEXTS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label[locale]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("teacher.outcome.support")}>
              {(p) => (
                <Select {...p} value={support} onChange={(e) => setSupport(e.target.value)}>
                  <option value="">—</option>
                  {SUPPORTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label[locale]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label={t("teacher.outcome.duration")}>
            {(p) => <Input {...p} type="number" min={0} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} />}
          </Field>
          <Field label={t("teacher.outcome.note")}>{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        </div>
      </Dialog>
    </>
  );
}

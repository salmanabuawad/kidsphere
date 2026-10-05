/**
 * "How did it go?" (spec §20): three big buttons, then Save — two taps for a
 * result-only feedback. Optional: what was observed, the support needed
 * (No / Some / Significant) and what helped. It becomes part of the
 * observation history (the backend mirrors it as an observation).
 */
import { useState } from "react";
import { Save } from "lucide-react";
import { Button, Dialog, Field, Textarea, ToggleChip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { useAction } from "@/lib/useAction";
import { cn } from "@/lib/utils";
import { FEEDBACK_SUPPORT, RESULT_EMOJI, RESULTS, sendFeedback, type ContentDetail, type FeedbackResult, type FeedbackSupport } from "./api";

export function FeedbackDialog({
  item,
  open,
  onClose,
  onSaved,
}: {
  item: ContentDetail;
  open: boolean;
  onClose: () => void;
  onSaved: (next: ContentDetail) => void;
}) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const { list, labelOf } = useOptions();
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [text, setText] = useState("");
  const [support, setSupport] = useState<FeedbackSupport | null>(null);
  const [helps, setHelps] = useState<string[]>([]);
  const helpOptions = list("what_helps").filter((h) => h.key !== "other");

  function reset() {
    setResult(null);
    setText("");
    setSupport(null);
    setHelps([]);
  }

  async function save() {
    if (!result || pending) return;
    const body = {
      result,
      ...(support ? { support_level: support } : {}),
      ...(text.trim() ? { observation: text.trim() } : {}),
      ...(helps.length ? { what_helped: helps } : {}),
    };
    const r = await run(() => sendFeedback(item.id, body), { success: t("content.feedback.saved") });
    if (r.ok) {
      reset();
      onSaved(r.data.content);
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("content.feedback.title")}
      description={t("content.feedback.subtitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button size="lg" onClick={() => void save()} disabled={!result} loading={pending} icon={<Save className="size-5" aria-hidden />}>
            {t("content.feedback.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div role="radiogroup" aria-label={t("content.feedback.title")} className="grid grid-cols-3 gap-2 sm:gap-3">
          {RESULTS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={result === r}
              onClick={() => setResult(r)}
              className={cn(
                "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-card px-2 py-3 text-center transition-colors",
                result === r ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40",
              )}
            >
              <span className="text-4xl leading-none" aria-hidden>
                {RESULT_EMOJI[r]}
              </span>
              <span className="text-sm font-semibold text-ink sm:text-base">{t(`content.results.${r}`)}</span>
            </button>
          ))}
        </div>

        <Field label={`${t("content.feedback.observe")} (${t("common.optional")})`}>
          {(p) => (
            <Textarea {...p} rows={3} maxLength={4000} value={text} placeholder={t("content.feedback.observePlaceholder")} onChange={(e) => setText(e.target.value)} />
          )}
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{t("content.feedback.support")}</legend>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_SUPPORT.map((s) => (
              <ToggleChip key={s} selected={support === s} onToggle={() => setSupport(support === s ? null : s)}>
                {t(`content.support.${s}`)}
              </ToggleChip>
            ))}
          </div>
        </fieldset>

        {helpOptions.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">{t("content.feedback.helped")}</legend>
            <div className="flex flex-wrap gap-2">
              {helpOptions.map((h) => (
                <ToggleChip
                  key={h.key}
                  tone="helps"
                  icon={h.icon}
                  selected={helps.includes(h.key)}
                  onToggle={() => setHelps((cur) => (cur.includes(h.key) ? cur.filter((x) => x !== h.key) : [...cur, h.key]))}
                >
                  {labelOf(h)}
                </ToggleChip>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}

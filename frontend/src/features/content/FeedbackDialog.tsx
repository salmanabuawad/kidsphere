/**
 * "How did it go?" (spec §20): three big buttons, then Save — two taps for a
 * result-only feedback. Optional: what was observed, the support needed
 * (No / Some / Significant) and what helped. It becomes part of the
 * observation history (the backend mirrors it as an observation).
 *
 * Each feedback gets one `client_request_id`, sent with every Save until one
 * succeeds: a retry after an error or a lost response, even after Cancel and
 * reopening (the answers are kept too), so the feedback is saved once. The id
 * changes only after a successful save.
 */
import { useState } from "react";
import { Check, Save } from "lucide-react";
import { Button, Dialog, Field, Textarea, ToggleChip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { useAction } from "@/lib/useAction";
import { cn, requestId as newRequestId } from "@/lib/utils";
import { FEEDBACK_SUPPORT, RESULTS, sendFeedback, type ContentDetail, type FeedbackResult, type FeedbackSupport } from "./api";
import { RESULT_ICONS } from "./ui";

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
  // One id per feedback, reused on every retry until a save succeeds: a repeat returns the first
  // save instead of a second feedback. Another content item remounts this dialog (keyed review).
  const [requestId, setRequestId] = useState(newRequestId);

  /** After a successful save only: the next feedback starts empty, with a new id. */
  function reset() {
    setResult(null);
    setText("");
    setSupport(null);
    setHelps([]);
    setRequestId(newRequestId());
  }

  async function save() {
    if (!result || pending) return;
    const body = {
      result,
      ...(support ? { support_level: support } : {}),
      ...(text.trim() ? { observation: text.trim() } : {}),
      ...(helps.length ? { what_helped: helps } : {}),
      client_request_id: requestId,
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
        {/* "How did it go?" (spec 6.11): three equal tiles, one neutral treatment, the same selection for every outcome. */}
        <div role="radiogroup" aria-label={t("content.feedback.title")} className="grid grid-cols-3 gap-2">
          {RESULTS.map((r) => {
            const Icon = RESULT_ICONS[r];
            const on = result === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setResult(r)}
                className={cn(
                  "relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg p-3 text-center transition-colors",
                  on ? "border-2 border-brand bg-brand-soft shadow-lip" : "border-[1.5px] border-line-strong bg-surface hover:bg-tray",
                )}
              >
                <Icon className="size-10 text-ink" aria-hidden />
                <span className="text-sm font-semibold text-ink sm:text-base">{t(`content.results.${r}`)}</span>
                {on && (
                  <span className="absolute end-1.5 top-1.5 flex size-6 items-center justify-center rounded-sm bg-brand text-on-brand" aria-hidden>
                    <Check className="size-4" strokeWidth={2.5} />
                  </span>
                )}
              </button>
            );
          })}
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

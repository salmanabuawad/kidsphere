/**
 * "How did it go at home?" — a parent's short reflection on content the teacher shared
 * (POST /api/content/{id}/home-reflections). One tap is enough; the note is optional and is shown
 * to the teacher only (it is never sent to the AI). The parent sees their own earlier reflections.
 */
import { useState } from "react";
import { Check } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Field, Textarea } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { useFormat } from "@/lib/format";
import { cn, requestId as newRequestId } from "@/lib/utils";
import { RESULTS, type FeedbackResult } from "./api";
import { RESULT_ICONS } from "./ui";

export type HomeReflection = {
  id: string;
  content_id: string;
  result: FeedbackResult;
  note: string | null;
  created_at: string;
  by_name: string | null;
};

export const homeReflectionsUrl = (contentId: string) => `/api/content/${encodeURIComponent(contentId)}/home-reflections`;

export function HomeReflectionCard({ contentId }: { contentId: string }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { pending, run } = useAction();
  const list = useFetch<{ reflections: HomeReflection[] }>(homeReflectionsUrl(contentId));
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [saved, setSaved] = useState(false);
  const earlier = list.data?.reflections ?? [];

  async function save() {
    if (!result) return;
    await run(
      () => api<{ reflection: HomeReflection }>(homeReflectionsUrl(contentId), {
        method: "POST",
        body: { result, note: note.trim() || null, client_request_id: requestId },
      }),
      {
        success: t("content.parent.reflect.saved"),
        onSuccess: () => {
          setSaved(true);
          setResult(null);
          setNote("");
          setRequestId(newRequestId());
          list.reload();
        },
      },
    );
  }

  return (
    <Card data-testid="home-reflection">
      <CardHeader title={t("content.parent.reflect.title")} description={t("content.parent.reflect.hint")} />
      <CardBody className="space-y-5">
        {saved && <p className="rounded-md bg-helps-soft p-3 text-ink">{t("content.parent.reflect.thanks")}</p>}
        <div role="radiogroup" aria-label={t("content.parent.reflect.title")} className="grid grid-cols-3 gap-2">
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
        <Field label={`${t("content.parent.reflect.note")} (${t("common.optional")})`} hint={t("content.parent.reflect.noteHint")}>
          {(p) => (
            <Textarea {...p} dir="auto" rows={3} maxLength={1000} value={note} placeholder={t("content.parent.reflect.notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
          )}
        </Field>
        <Button onClick={save} disabled={!result} loading={pending}>
          {t("content.parent.reflect.save")}
        </Button>
        {earlier.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink-muted">{t("content.parent.reflect.earlier")}</h3>
            <ul className="space-y-2" data-testid="home-reflection-list">
              {earlier.map((r) => {
                const Icon = RESULT_ICONS[r.result];
                return (
                  <li key={r.id} className="flex items-start gap-3 rounded-md bg-tray p-3">
                    <Icon className="size-6 shrink-0 text-ink" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {t(`content.results.${r.result}`)} · <span className="font-normal text-ink-muted">{formatDate(r.created_at)}</span>
                      </p>
                      {r.note && (
                        <p dir="auto" className="text-ink">
                          {r.note}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </CardBody>
    </Card>
  );
}

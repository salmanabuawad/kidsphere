"use client";

import type { ContentBody } from "@/lib/ai/schemas";
import { Field, Input, Textarea, Checkbox } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n/client";
import { dirOf } from "@/lib/i18n/config";

/** Structured editor: teachers edit text, pictures and choices without touching JSON. */
export function BodyEditor({ body, onChange }: { body: ContentBody; onChange: (b: ContentBody) => void }) {
  const { t } = useI18n();
  const dir = dirOf(body.language);

  return (
    <div className="space-y-4" dir={dir}>
      <Field label={t("teacher.content.editTitle")}>
        {(p) => <Input {...p} value={body.title} onChange={(e) => onChange({ ...body, title: e.target.value })} data-testid="edit-title" />}
      </Field>

      {body.kind === "story" &&
        body.scenes.map((s, i) => (
          <div key={s.id} className="border-line rounded-2xl border p-4">
            <p className="mb-2 text-sm font-semibold">{t("teacher.content.scene", { n: i + 1 })}</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
              <Field label={t("teacher.content.narration")}>
                {(p) => (
                  <Textarea
                    {...p}
                    rows={2}
                    value={s.narration}
                    data-testid={`edit-scene-${i}`}
                    onChange={(e) => onChange({ ...body, scenes: body.scenes.map((x) => (x.id === s.id ? { ...x, narration: e.target.value } : x)) })}
                  />
                )}
              </Field>
              <Field label={t("teacher.content.illustration")}>
                {(p) => (
                  <Input
                    {...p}
                    className="text-center text-2xl"
                    value={s.illustration}
                    maxLength={16}
                    onChange={(e) => onChange({ ...body, scenes: body.scenes.map((x) => (x.id === s.id ? { ...x, illustration: e.target.value } : x)) })}
                  />
                )}
              </Field>
            </div>
            {s.choices && s.choices.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-muted text-xs font-medium">{t("teacher.content.choices")}</p>
                {s.choices.map((c, ci) => (
                  <div key={ci} className="flex gap-2">
                    <Input
                      aria-label={t("teacher.content.choiceLabel")}
                      value={c.label}
                      onChange={(e) =>
                        onChange({
                          ...body,
                          scenes: body.scenes.map((x) =>
                            x.id === s.id ? { ...x, choices: x.choices!.map((cc, j) => (j === ci ? { ...cc, label: e.target.value } : cc)) } : x,
                          ),
                        })
                      }
                    />
                    <span className="text-muted flex shrink-0 items-center text-xs">
                      {t("teacher.content.goesTo")} {body.scenes.findIndex((x) => x.id === c.nextSceneId) + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

      {body.kind === "routine" &&
        body.steps.map((s, i) => (
          <div key={s.id} className="border-line grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_2fr_80px]">
            <Field label={t("teacher.content.step", { n: i + 1 })}>
              {(p) => (
                <Input
                  {...p}
                  value={s.label}
                  onChange={(e) => onChange({ ...body, steps: body.steps.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)) })}
                />
              )}
            </Field>
            <Field label={t("teacher.content.narration")}>
              {(p) => (
                <Input
                  {...p}
                  value={s.narration}
                  onChange={(e) => onChange({ ...body, steps: body.steps.map((x) => (x.id === s.id ? { ...x, narration: e.target.value } : x)) })}
                />
              )}
            </Field>
            <Field label={t("teacher.content.illustration")}>
              {(p) => (
                <Input
                  {...p}
                  className="text-center text-xl"
                  maxLength={16}
                  value={s.illustration}
                  onChange={(e) => onChange({ ...body, steps: body.steps.map((x) => (x.id === s.id ? { ...x, illustration: e.target.value } : x)) })}
                />
              )}
            </Field>
          </div>
        ))}

      {body.kind === "activity" && (
        <>
          <Field label={t("teacher.content.instructions")}>
            {(p) => <Input {...p} value={body.instructions} onChange={(e) => onChange({ ...body, instructions: e.target.value })} />}
          </Field>
          {body.rounds.map((r, i) => (
            <div key={r.id} className="border-line space-y-3 rounded-2xl border p-4">
              <p className="text-sm font-semibold">{t("teacher.content.round", { n: i + 1 })}</p>
              <Field label={t("teacher.content.prompt")}>
                {(p) => (
                  <Input
                    {...p}
                    value={r.prompt}
                    onChange={(e) => onChange({ ...body, rounds: body.rounds.map((x) => (x.id === r.id ? { ...x, prompt: e.target.value } : x)) })}
                  />
                )}
              </Field>
              {r.options.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={t("teacher.content.illustration")}
                    className="w-16 text-center text-xl"
                    maxLength={16}
                    value={o.illustration}
                    onChange={(e) =>
                      onChange({
                        ...body,
                        rounds: body.rounds.map((x) =>
                          x.id === r.id ? { ...x, options: x.options.map((oo) => (oo.id === o.id ? { ...oo, illustration: e.target.value } : oo)) } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={t("teacher.content.option")}
                    className="min-w-40 flex-1"
                    value={o.label}
                    onChange={(e) =>
                      onChange({
                        ...body,
                        rounds: body.rounds.map((x) =>
                          x.id === r.id ? { ...x, options: x.options.map((oo) => (oo.id === o.id ? { ...oo, label: e.target.value } : oo)) } : x,
                        ),
                      })
                    }
                  />
                  <Checkbox
                    label={t("teacher.content.preferred")}
                    checked={o.isPreferred}
                    onChange={(e) =>
                      onChange({
                        ...body,
                        rounds: body.rounds.map((x) =>
                          x.id === r.id ? { ...x, options: x.options.map((oo) => (oo.id === o.id ? { ...oo, isPreferred: e.target.checked } : oo)) } : x,
                        ),
                      })
                    }
                  />
                </div>
              ))}
              <Field label={t("teacher.content.encouragement")}>
                {(p) => (
                  <Input
                    {...p}
                    value={r.encouragement}
                    onChange={(e) => onChange({ ...body, rounds: body.rounds.map((x) => (x.id === r.id ? { ...x, encouragement: e.target.value } : x)) })}
                  />
                )}
              </Field>
            </div>
          ))}
        </>
      )}

      {body.kind === "guide" &&
        body.steps.map((s, i) => (
          <div key={s.id} className="border-line grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_2fr]">
            <Field label={t("teacher.content.step", { n: i + 1 })}>
              {(p) => (
                <Input
                  {...p}
                  value={s.label}
                  onChange={(e) => onChange({ ...body, steps: body.steps.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)) })}
                />
              )}
            </Field>
            <Field label={t("teacher.content.instructions")}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={s.instructions}
                  onChange={(e) => onChange({ ...body, steps: body.steps.map((x) => (x.id === s.id ? { ...x, instructions: e.target.value } : x)) })}
                />
              )}
            </Field>
          </div>
        ))}
    </div>
  );
}

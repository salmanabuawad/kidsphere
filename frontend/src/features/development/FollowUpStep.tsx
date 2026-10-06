import { CalendarClock } from "lucide-react";
import { Card, CardBody, CardHeader, Field, Input, Textarea, ToggleChip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import type { DraftFocus, FollowUpInput, ImprovementLevel, InvolvementStep } from "./api";

/**
 * The review's last step, Domain 16 (X-24): when we will look again, whether anything changed
 * overall and in which areas, what worked, what needs to change and the next step with the family
 * or the team. The teacher fills it in; a suggestion never does (it always starts empty).
 */
export type FollowUpDraft = {
  reassessment_on: string;
  level: ImprovementLevel | "";
  note: string;
  domains: string[];
  focusIds: string[];
  areasText: string;
  what_worked: string;
  what_to_change: string;
  involvement: InvolvementStep | "";
  involvementNote: string;
};

export const emptyFollowUp = (): FollowUpDraft => ({
  reassessment_on: "",
  level: "",
  note: "",
  domains: [],
  focusIds: [],
  areasText: "",
  what_worked: "",
  what_to_change: "",
  involvement: "",
  involvementNote: "",
});

/** The `follow_up` body, or undefined when nothing was filled in. */
export function followUpPayload(f: FollowUpDraft): FollowUpInput | undefined {
  const s = (v: string) => v.trim() || undefined;
  const out: FollowUpInput = {};
  if (f.reassessment_on) out.reassessment_on = f.reassessment_on;
  if (f.level || s(f.note)) out.improvement = { ...(f.level ? { level: f.level } : {}), ...(s(f.note) ? { note: s(f.note) } : {}) };
  if (f.domains.length || f.focusIds.length || s(f.areasText))
    out.areas = {
      ...(f.domains.length ? { domains: f.domains } : {}),
      ...(f.focusIds.length ? { focus_area_ids: f.focusIds } : {}),
      ...(s(f.areasText) ? { text: s(f.areasText) } : {}),
    };
  if (s(f.what_worked)) out.what_worked = s(f.what_worked);
  if (s(f.what_to_change)) out.what_to_change = s(f.what_to_change);
  if (f.involvement || s(f.involvementNote))
    out.involvement = { ...(f.involvement ? { key: f.involvement } : {}), ...(s(f.involvementNote) ? { note: s(f.involvementNote) } : {}) };
  return Object.keys(out).length ? out : undefined;
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function SingleChoice<T extends string>({ label, value, options, onChange }: { label: string; value: T | ""; options: { value: T; label: string; icon?: string }[]; onChange: (v: T | "") => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-2">
      <p className="text-sm font-medium text-ink">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <ToggleChip key={o.value} single selected={value === o.value} icon={o.icon} onToggle={() => onChange(value === o.value ? "" : o.value)}>
            {o.label}
          </ToggleChip>
        ))}
      </div>
    </div>
  );
}

export function FollowUpStep({ value, focusAreas, onChange }: { value: FollowUpDraft; focusAreas: DraftFocus[]; onChange: (patch: Partial<FollowUpDraft>) => void }) {
  const { t } = useI18n();
  const { list, labelOf } = useOptions();
  const levels = list("improvement_levels").map((o) => ({ value: o.key as ImprovementLevel, label: labelOf(o), icon: o.icon }));
  const steps = list("involvement_steps").map((o) => ({ value: o.key as InvolvementStep, label: labelOf(o) }));
  const domains = list("observation_domains");

  return (
    <Card data-testid="follow-up-step">
      <CardHeader title={t("development.review.steps.followUp")} icon={<CalendarClock className="size-4" aria-hidden />} description={t("development.review.followUp.hint")} />
      <CardBody className="space-y-6">
        <Field label={t("development.review.followUp.reassessment")} hint={t("development.review.followUp.reassessmentHint")}>
          {(p) => <Input {...p} type="date" dir="ltr" className="max-w-56" value={value.reassessment_on} onChange={(e) => onChange({ reassessment_on: e.target.value })} />}
        </Field>

        <div className="space-y-3">
          <SingleChoice label={t("development.review.followUp.improvement")} value={value.level} options={levels} onChange={(level) => onChange({ level })} />
          <Field label={t("development.review.followUp.improvementNote")}>
            {(p) => <Textarea {...p} dir="auto" rows={2} maxLength={1000} value={value.note} onChange={(e) => onChange({ note: e.target.value })} />}
          </Field>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium text-ink">{t("development.review.followUp.areas")}</legend>
          {domains.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("development.review.followUp.areas")}>
              {domains.map((d) => (
                <ToggleChip key={d.key} selected={value.domains.includes(d.key)} icon={d.icon} onToggle={() => onChange({ domains: toggle(value.domains, d.key) })}>
                  {labelOf(d)}
                </ToggleChip>
              ))}
            </div>
          )}
          {focusAreas.length > 0 && (
            <div className="space-y-2">
              <p className="text-caption text-ink-muted">{t("development.review.followUp.areasGoals")}</p>
              <div className="flex flex-wrap gap-2">
                {focusAreas.map((f) => (
                  <ToggleChip key={f.id} tone="focus" selected={value.focusIds.includes(f.id)} onToggle={() => onChange({ focusIds: toggle(value.focusIds, f.id) })}>
                    <span dir="auto">{f.title}</span>
                  </ToggleChip>
                ))}
              </div>
            </div>
          )}
          <Field label={t("development.review.followUp.areasText")}>
            {(p) => <Input {...p} dir="auto" maxLength={500} value={value.areasText} onChange={(e) => onChange({ areasText: e.target.value })} />}
          </Field>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("development.review.followUp.whatWorked")}>
            {(p) => <Textarea {...p} dir="auto" rows={3} maxLength={1000} value={value.what_worked} onChange={(e) => onChange({ what_worked: e.target.value })} />}
          </Field>
          <Field label={t("development.review.followUp.whatToChange")}>
            {(p) => <Textarea {...p} dir="auto" rows={3} maxLength={1000} value={value.what_to_change} onChange={(e) => onChange({ what_to_change: e.target.value })} />}
          </Field>
        </div>

        <div className="space-y-3 rounded-md border border-line p-4">
          <SingleChoice label={t("development.review.followUp.involvement")} value={value.involvement} options={steps} onChange={(involvement) => onChange({ involvement })} />
          <p className="text-caption text-ink-muted">{t("development.review.followUp.involvementHint")}</p>
          <Field label={t("development.review.followUp.involvementNote")}>
            {(p) => <Textarea {...p} dir="auto" rows={2} maxLength={1000} value={value.involvementNote} onChange={(e) => onChange({ involvementNote: e.target.value })} />}
          </Field>
        </div>
      </CardBody>
    </Card>
  );
}

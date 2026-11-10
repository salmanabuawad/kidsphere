/**
 * Optional "Situation" for Create content (GET /api/scenarios): Event -> Thought -> Feeling -> Response.
 * The teacher picks a ready situation that fits the child's goal, or writes her own; the content is
 * then built around it. Ready situations matching the focus suggestion come first.
 */
import { Field, Input, Select, ToggleChip } from "@/components/ui";
import { pick } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useFetch } from "@/lib/useFetch";

type Lang = Partial<Record<"en" | "ar" | "he", string>>;
type Scenario = { key: string; goals: string[]; feeling: string; title: Lang; event: Lang; interpretation: Lang; response: Lang };
type Feeling = { key: string; emoji: string; label: Lang };
export type OwnScenario = { event: string; interpretation: string; feeling: string; response: string };
export type ScenarioChoice = { key: string } | OwnScenario;

export function ScenarioPicker({ value, onChange, goal }: { value: ScenarioChoice | null; onChange: (v: ScenarioChoice | null) => void; goal: string | null }) {
  const { t, locale } = useI18n();
  const data = useFetch<{ scenarios: Scenario[]; feelings: Feeling[] }>("/api/scenarios").data;
  if (!data) return null;
  const matching = goal ? data.scenarios.filter((s) => s.goals.includes(goal)) : [];
  const list = matching.length > 0 ? matching : data.scenarios;
  const own: OwnScenario | null = value && "event" in value ? value : null;
  const blank: OwnScenario = { event: "", interpretation: "", feeling: data.feelings[0]?.key ?? "angry", response: "" };
  const chosenKey = value && "key" in value ? value.key : null;
  const chosen = chosenKey ? data.scenarios.find((s) => s.key === chosenKey) : undefined;
  return (
    <div className="mt-5 space-y-3" data-testid="scenario-picker">
      <p className="text-sm font-semibold text-ink">{t("content.create.scenario.title")}</p>
      <p className="text-caption text-ink-muted">{t("content.create.scenario.hint")}</p>
      <div className="flex flex-wrap gap-2">
        <ToggleChip single selected={!value} onToggle={() => onChange(null)}>
          {t("content.create.scenario.none")}
        </ToggleChip>
        {list.map((s) => (
          <ToggleChip key={s.key} single selected={chosenKey === s.key} onToggle={() => onChange({ key: s.key })}>
            {pick(s.title, locale)}
          </ToggleChip>
        ))}
        <ToggleChip single selected={!!own} onToggle={() => onChange(own ?? blank)}>
          {t("content.create.scenario.own")}
        </ToggleChip>
      </div>
      {chosen && (
        <ol className="list-decimal space-y-1 ps-5 text-sm text-ink" data-testid="scenario-steps">
          <li dir="auto">{pick(chosen.event, locale)}</li>
          <li dir="auto">{pick(chosen.interpretation, locale)}</li>
          <li>{pick(data.feelings.find((f) => f.key === chosen.feeling)?.label ?? {}, locale)}</li>
          <li dir="auto">{pick(chosen.response, locale)}</li>
        </ol>
      )}
      {own && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("content.create.scenario.event")}>
            {(p) => <Input {...p} dir="auto" maxLength={200} value={own.event} onChange={(e) => onChange({ ...own, event: e.target.value })} />}
          </Field>
          <Field label={t("content.create.scenario.thought")} hint={t("content.create.scenario.thoughtHint")}>
            {(p) => <Input {...p} dir="auto" maxLength={200} value={own.interpretation} onChange={(e) => onChange({ ...own, interpretation: e.target.value })} />}
          </Field>
          <Field label={t("content.create.scenario.feeling")}>
            {(p) => (
              <Select {...p} value={own.feeling} onChange={(e) => onChange({ ...own, feeling: e.target.value })}>
                {data.feelings.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.emoji} {pick(f.label, locale)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("content.create.scenario.response")} hint={t("content.create.scenario.responseHint")}>
            {(p) => <Input {...p} dir="auto" maxLength={200} value={own.response} onChange={(e) => onChange({ ...own, response: e.target.value })} />}
          </Field>
        </div>
      )}
    </div>
  );
}

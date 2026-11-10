/**
 * "Suggested next step" for each active Current Focus (GET /api/children/{id}/next-steps).
 *
 * Facts and suggestions are shown apart: first what was recorded lately (who reported it, the
 * result or support needed, never a free text), then the suggestion and a plain-words reason.
 * It is a simple rule, not an AI judgement, and nothing happens until the teacher chooses:
 * "Create" opens Create content pre-filled for this focus.
 */
import { Compass, Library } from "lucide-react";
import { Link } from "react-router";
import { ButtonLink, Card, CardBody, CardHeader } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useFetch } from "@/lib/useFetch";

export type NextFact = {
  kind: "teacher_feedback" | "home_reflection" | "observation";
  at: string;
  result: "worked_well" | "partly" | "did_not_work" | null;
  support_level: string | null;
  content_title: string | null;
  content_type: string | null;
  reported_by: "teacher" | "parent";
};

export type NextFocus = {
  focus_area_id: string;
  title: string;
  category: string;
  suggestion_key: string | null;
  signal: "start" | "build" | "repeat" | "smaller_step";
  facts: NextFact[];
  suggestions: { content_type: string; mode: string }[];
  library: { id: string; title: string; content_type: string; language: string }[];
};

export const nextStepsUrl = (childId: string) => `/api/children/${encodeURIComponent(childId)}/next-steps`;

function FactLine({ fact }: { fact: NextFact }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { optionLabel } = useOptions();
  const what = fact.result ? t(`content.results.${fact.result}`) : fact.support_level ? optionLabel("support_levels", fact.support_level) : "";
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink">
      <span className="font-semibold">{t(`nextSteps.kinds.${fact.kind}`)}</span>
      <span>{what}</span>
      {fact.content_title && (
        <span dir="auto" className="text-ink-muted">
          · {fact.content_title}
        </span>
      )}
      <span className="text-ink-muted">· {formatDate(fact.at)}</span>
    </li>
  );
}

export function NextStepsCard({ childId }: { childId: string }) {
  const { t } = useI18n();
  const { data } = useFetch<{ focus_areas: NextFocus[] }>(nextStepsUrl(childId));
  const focusAreas = data?.focus_areas ?? [];
  if (focusAreas.length === 0) return null;
  return (
    <Card data-testid="next-steps">
      <CardHeader title={t("nextSteps.title")} description={t("nextSteps.subtitle")} icon={<Compass className="text-ink-muted" aria-hidden />} />
      <CardBody className="space-y-5">
        {focusAreas.map((f) => (
          <section key={f.focus_area_id} className="space-y-3 rounded-md border border-line p-4" data-testid="next-step">
            <h3 dir="auto" className="font-semibold text-ink">
              {f.title}
            </h3>
            <div>
              <p className="text-caption font-semibold text-ink-muted">{t("nextSteps.factsTitle")}</p>
              {f.facts.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {f.facts.map((fact, i) => (
                    <FactLine key={i} fact={fact} />
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink-muted">{t("nextSteps.noFacts")}</p>
              )}
            </div>
            <div className="rounded-md bg-focus-soft p-3">
              <p className="text-caption font-semibold text-ink-muted">{t("nextSteps.suggestionTitle")}</p>
              <p className="mt-1 text-ink" data-testid="next-step-reason">
                {t(`nextSteps.reasons.${f.signal}`)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {f.suggestions.map((s) => (
                  <ButtonLink
                    key={s.content_type}
                    size="sm"
                    variant="outline"
                    to={paths.newContent(childId, { mode: s.mode, focus: f.focus_area_id, type: s.content_type })}
                  >
                    {t("nextSteps.create", { type: t(`content.types.${s.content_type}`) })}
                  </ButtonLink>
                ))}
              </div>
            </div>
            {f.library.length > 0 && (
              <div>
                <p className="text-caption flex items-center gap-1.5 font-semibold text-ink-muted">
                  <Library className="size-4" aria-hidden />
                  {t("nextSteps.libraryTitle")}
                </p>
                <ul className="mt-1 space-y-1">
                  {f.library.map((item) => (
                    <li key={item.id}>
                      <Link to={paths.libraryItem(item.id)} dir="auto" className="text-sm font-medium text-ink underline underline-offset-2">
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
        <p className="text-caption text-ink-muted">{t("nextSteps.disclaimer")}</p>
      </CardBody>
    </Card>
  );
}

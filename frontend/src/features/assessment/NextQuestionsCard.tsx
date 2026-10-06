import { Eye, Search } from "lucide-react";
import { ButtonLink, Card, CardBody, CardHeader } from "@/components/ui";
import { ProvenanceBadge } from "@/components/source";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useFetch } from "@/lib/useFetch";
import type { LookFor } from "@/features/observations";

const CHILD_TOKEN = "[child]";
const MAX_QUESTIONS = 5;

type StoredSuggestion = {
  id: string;
  kind: string;
  output?: { next_observation_questions?: { domain?: string | null; question?: string | null }[] | null } | null;
};

/** The newest stored AI suggestion that carries observation questions (newest first from the API). */
export function latestQuestions(suggestions: StoredSuggestion[] | undefined, childName: string): LookFor[] {
  for (const s of suggestions ?? []) {
    const raw = s.output?.next_observation_questions ?? [];
    const out = raw
      .filter((q) => typeof q?.question === "string" && q.question.trim())
      .slice(0, MAX_QUESTIONS)
      .map((q) => ({ question: q.question!.split(CHILD_TOKEN).join(childName).trim(), domain: q.domain ?? null }));
    if (out.length) return out;
  }
  return [];
}

/**
 * "What to look for next" (COVERAGE-MATRIX §5.5): observation questions from the latest AI
 * suggestion, labelled AI SUGGESTED. Tapping one opens the quick-observation form with the
 * question shown as a reminder and its area pre-selected (passed in router state, never in the URL).
 * Shows nothing when there are no questions yet.
 */
export function NextQuestionsCard({ childId, childName }: { childId: string; childName: string }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const { data } = useFetch<{ suggestions: StoredSuggestion[] }>(`/api/children/${encodeURIComponent(childId)}/ai-suggestions`);
  const questions = latestQuestions(data?.suggestions, childName);
  if (!questions.length) return null;
  return (
    <Card data-next-questions>
      <CardHeader icon={<Search aria-hidden />} title={t("assessment.next.title")} description={t("assessment.next.intro")} action={<ProvenanceBadge kind="ai_suggested" />} />
      <CardBody>
        <ul className="space-y-3">
          {questions.map((q, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
              <div className="min-w-0 flex-1">
                {q.domain && <p className="text-caption font-semibold text-ink-muted">{optionLabel("ai_domains", q.domain)}</p>}
                <p className="text-base text-ink" dir="auto">
                  {q.question}
                </p>
              </div>
              <ButtonLink size="sm" variant="secondary" icon={<Eye aria-hidden />} to={paths.childObserve(childId)} state={{ lookFor: q }}>
                {t("assessment.next.observe")}
              </ButtonLink>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

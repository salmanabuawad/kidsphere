/**
 * /parent/ideas: the Parent Copilot. A parent picks a child, then a common situation or a short
 * question, and gets practical ideas from KidSphere's curated guidance (adapted by the local AI
 * when it is on): what is going on, steps to try, words to say, a shared activity, when to talk to
 * the kindergarten team, and activities the teacher already shared. Safety questions get a fixed
 * answer with emergency and welfare numbers. Questions are not stored.
 */
import { useState } from "react";
import { Link } from "react-router";
import { Lightbulb, MessageCircle } from "lucide-react";
import { Alert, Button, Card, CardBody, CardHeader, Field, PageHeader, Select, Textarea, ToggleChip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { paths } from "@/lib/paths";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";

type Topic = { key: string; title: string };
type Answer = { title: string; explanation: string; steps: string[]; say: string[]; activity: string | null; see_professional: string | null };
type AskResponse = {
  kind: "guidance" | "safety" | "no_match";
  article_key: string | null;
  source: "guidance" | "local_ai";
  answer: Answer | null;
  topics: Topic[];
  suggested_content: { id: string; title: string; content_type: string }[];
};
type ChildRow = { id: string; name: string; preferred_name?: string | null };

function childrenOf(data: unknown): ChildRow[] {
  const raw = data && typeof data === "object" ? (data as { children?: unknown }).children : null;
  return Array.isArray(raw) ? (raw as ChildRow[]).filter((c) => c && typeof c.id === "string") : [];
}

export function CopilotPage() {
  const { t, locale } = useI18n();
  const { pending, run } = useAction();
  const kids = childrenOf(useFetch<unknown>("/api/children").data);
  const topics = useFetch<{ topics: Topic[] }>(`/api/copilot/topics?language=${locale}`).data?.topics ?? [];
  const [childId, setChildId] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const child = childId || kids[0]?.id || "";

  async function ask(body: { question?: string; topic?: string }) {
    if (!child) return;
    const r = await run(() => api<AskResponse>("/api/copilot/ask", { method: "POST", body: { child_id: child, language: locale, ...body } }));
    if (r.ok) setResult(r.data);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader icon={<Lightbulb />} title={t("family.copilot.title")} description={t("family.copilot.subtitle")} />
      <Card>
        <CardBody className="space-y-4">
          {kids.length > 1 && (
            <Field label={t("family.copilot.child")}>
              {(p) => (
                <Select {...p} value={child} onChange={(e) => setChildId(e.target.value)}>
                  {kids.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.preferred_name || k.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">{t("family.copilot.common")}</p>
            <div className="flex flex-wrap gap-2" data-testid="copilot-topics">
              {topics.map((tp) => (
                <ToggleChip key={tp.key} selected={result?.article_key === tp.key} onToggle={() => void ask({ topic: tp.key })} disabled={pending}>
                  {tp.title}
                </ToggleChip>
              ))}
            </div>
          </div>
          <Field label={t("family.copilot.ownWords")} hint={t("family.copilot.privacy")}>
            {(p) => <Textarea {...p} dir="auto" rows={2} maxLength={500} value={question} placeholder={t("family.copilot.placeholder")} onChange={(e) => setQuestion(e.target.value)} />}
          </Field>
          <Button icon={<MessageCircle aria-hidden />} onClick={() => void ask({ question: question.trim() })} disabled={!question.trim()} loading={pending}>
            {t("family.copilot.ask")}
          </Button>
        </CardBody>
      </Card>
      {result && <AnswerView result={result} />}
      <p className="text-caption text-ink-muted">{t("family.copilot.disclaimer")}</p>
    </div>
  );
}

function AnswerView({ result }: { result: AskResponse }) {
  const { t } = useI18n();
  if (result.kind === "no_match" || !result.answer) return <Alert tone="info">{t("family.copilot.noMatch")}</Alert>;
  const a = result.answer;
  if (result.kind === "safety")
    return (
      <Alert tone="warning" title={a.title}>
        <p dir="auto">{a.explanation}</p>
        <ul className="mt-2 list-disc space-y-1 ps-5" data-testid="safety-steps">
          {a.steps.map((s, i) => (
            <li key={i} dir="auto">
              {s}
            </li>
          ))}
        </ul>
      </Alert>
    );
  return (
    <Card data-testid="copilot-answer">
      <CardHeader title={a.title} description={result.source === "local_ai" ? t("family.copilot.adapted") : undefined} />
      <CardBody className="space-y-4">
        <p className="leading-relaxed text-ink" dir="auto">
          {a.explanation}
        </p>
        <Section title={t("family.copilot.steps")} items={a.steps} ordered />
        <Section title={t("family.copilot.say")} items={a.say} />
        {a.activity && (
          <div className="rounded-md bg-helps-soft p-3">
            <p className="text-sm font-semibold text-ink">{t("family.copilot.activity")}</p>
            <p className="mt-1 text-ink" dir="auto">
              {a.activity}
            </p>
          </div>
        )}
        {result.suggested_content.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-ink">{t("family.sharedForYou")}</p>
            <ul className="mt-1 space-y-1">
              {result.suggested_content.map((c) => (
                <li key={c.id}>
                  <Link to={paths.parentContent(c.id)} dir="auto" className="text-sm font-medium text-ink underline underline-offset-2">
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {a.see_professional && (
          <p className="rounded-md border border-line p-3 text-sm text-ink" dir="auto">
            <span className="font-semibold">{t("family.copilot.whenToTalk")} </span>
            {a.see_professional}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function Section({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      <List className={`mt-1 space-y-1 ps-5 ${ordered ? "list-decimal" : "list-disc"}`}>
        {items.map((s, i) => (
          <li key={i} className="text-ink" dir="auto">
            {s}
          </li>
        ))}
      </List>
    </div>
  );
}

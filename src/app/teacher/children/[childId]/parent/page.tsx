import { Lock, MessageCircle } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { listQuestionnairesForStaff } from "@/server/services/questionnaires";
import { listParentMessages } from "@/server/services/parent-messages";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { QUESTIONNAIRE } from "@/features/questionnaires/definition";
import { AnswerView } from "@/features/questionnaires/answer-view";

export default async function ParentInsight({ params }: PageProps<"/teacher/children/[childId]/parent">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t, locale } = await getI18n();
  const [questionnaires, messages] = await Promise.all([listQuestionnairesForStaff(actor, childId), listParentMessages(actor, childId)]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {questionnaires.length === 0 && <EmptyState title={t("teacher.parentInsight.noQuestionnaire")} />}
        {questionnaires.map((q) => (
          <div key={q.id} className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{t("teacher.parentInsight.title")}</h2>
              <Badge tone={q.status === "SUBMITTED" ? "green" : "amber"}>
                {q.status === "SUBMITTED" && q.submittedAt
                  ? t("teacher.parentInsight.submitted", { date: formatDate(q.submittedAt, locale) })
                  : t("teacher.parentInsight.inProgress")}
              </Badge>
              <span className="text-muted text-sm">{t("teacher.parentInsight.by", { name: q.parentName })}</span>
            </div>
            {QUESTIONNAIRE.map((section) => {
              const answered = section.questions.filter((qq) => q.answers[qq.key] !== undefined);
              if (answered.length === 0) return null;
              return (
                <Card key={section.key}>
                  <CardHeader title={section.title[locale]} />
                  <CardBody>
                    <dl className="divide-line divide-y">
                      {answered.map((qq) => (
                        <div key={qq.key} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:gap-4">
                          <dt className="text-muted text-sm">{qq.label[locale]}</dt>
                          <dd className="text-sm">
                            <AnswerView question={qq} value={q.answers[qq.key]} locale={locale} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CardBody>
                </Card>
              );
            })}
            {q.sensitiveAnswers && Object.keys(q.sensitiveAnswers).length > 0 && (
              <Card className="border-amber-200">
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Lock className="size-4 text-amber-700" />
                      {t("teacher.parentInsight.protected")}
                    </span>
                  }
                  description={t("teacher.parentInsight.protectedHint")}
                />
                <CardBody>
                  <dl className="divide-line divide-y">
                    {QUESTIONNAIRE.flatMap((s) => s.questions)
                      .filter((qq) => q.sensitiveAnswers![qq.key] !== undefined)
                      .map((qq) => (
                        <div key={qq.key} className="grid gap-1 py-2.5 sm:grid-cols-2 sm:gap-4">
                          <dt className="text-muted text-sm">{qq.label[locale]}</dt>
                          <dd className="text-sm">
                            <AnswerView question={qq} value={q.sensitiveAnswers![qq.key]} locale={locale} />
                          </dd>
                        </div>
                      ))}
                  </dl>
                </CardBody>
              </Card>
            )}
          </div>
        ))}
      </div>

      <Card className="h-fit">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <MessageCircle className="text-brand size-4" />
              {t("teacher.parentInsight.messages")}
            </span>
          }
        />
        <CardBody className="space-y-3">
          {messages.length === 0 && <p className="text-muted text-sm">{t("teacher.parentInsight.noMessages")}</p>}
          {messages.map((m) => (
            <div key={m.id} className="rounded-xl bg-stone-50 p-3">
              <p className="text-sm">{m.body}</p>
              <p className="text-muted mt-1 text-xs">
                {m.authorName} · {formatDateTime(m.createdAt, locale)}
              </p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

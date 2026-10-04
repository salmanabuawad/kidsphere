import Link from "next/link";
import { Plus, Sparkles, Zap } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { getInternalProfile } from "@/server/services/profile";
import { listObservations, shouldShowProfessionalTeamNote } from "@/server/services/observations";
import { getProgress } from "@/server/services/outcomes";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { VocabChip } from "@/features/child-understanding/vocab-chip";
import { vocabEntry, vocabLabel } from "@/features/child-understanding/vocabulary";
import { contextLabel } from "@/features/observations/definition";

export default async function ChildOverview({ params }: PageProps<"/teacher/children/[childId]">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t, locale } = await getI18n();
  const [{ attributes }, observations, progress, professionalNote] = await Promise.all([
    getInternalProfile(actor, childId),
    listObservations(actor, childId, 5),
    getProgress(actor, childId),
    shouldShowProfessionalTeamNote(childId),
  ]);
  const active = attributes.filter((a) => a.status === "ACTIVE");
  const strengths = active.filter((a) => a.category === "STRENGTH");
  const interests = active.filter((a) => a.category === "INTEREST");
  const supports = active.filter((a) => a.category === "SUPPORT");
  const pending = attributes.filter((a) => a.status === "PENDING_CONFIRMATION").length;
  const goals = progress.goals.filter((g) => g.status === "ACTIVE");
  const base = `/teacher/children/${childId}`;

  return (
    <div className="space-y-5">
      {pending > 0 && (
        <Alert
          tone="tip"
          title={t("teacher.child.pendingBanner", { n: pending })}
          action={
            <ButtonLink href={`${base}/profile`} size="sm" variant="outline">
              {t("teacher.child.reviewNow")}
            </ButtonLink>
          }
        />
      )}
      {professionalNote && <Alert tone="info">{t("teacher.child.professionalNote")}</Alert>}

      {/* Strength-first: strengths lead every child summary. */}
      <section aria-labelledby="strengths-h">
        <h2 id="strengths-h" className="mb-3 text-lg font-semibold">
          {t("teacher.child.strengths")}
        </h2>
        {strengths.length === 0 ? (
          <p className="text-muted text-sm">{t("teacher.child.strengthsEmpty")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {strengths.slice(0, 5).map((s) => (
              <div key={s.id} className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-4">
                <div className="text-3xl" aria-hidden>
                  {vocabEntry("STRENGTH", s.value)?.emoji ?? "⭐"}
                </div>
                <p className="mt-2 font-semibold text-emerald-950">{vocabLabel("STRENGTH", s.value, locale)}</p>
                <p className="text-xs text-emerald-800/80">{t(`enums.confidence.${s.confidence}`)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("teacher.child.interests")} />
          <CardBody className="flex flex-wrap gap-2">
            {interests.length === 0 && <p className="text-muted text-sm">{t("teacher.child.interestsEmpty")}</p>}
            {interests.map((i) => (
              <VocabChip key={i.id} category="INTEREST" value={i.value} locale={locale} size="lg" />
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("teacher.child.whatHelps")} />
          <CardBody className="flex flex-wrap gap-2">
            {supports.length === 0 && <p className="text-muted text-sm">{t("teacher.child.whatHelpsEmpty")}</p>}
            {supports.map((i) => (
              <VocabChip key={i.id} category="SUPPORT" value={i.value} locale={locale} size="lg" />
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t("teacher.child.currentFocus")}
          action={
            goals.length < 3 ? (
              <ButtonLink href={`${base}/goals/new`} size="sm" variant="soft">
                <Plus className="size-4" />
                {t("teacher.child.newGoal")}
              </ButtonLink>
            ) : null
          }
        />
        <CardBody className="space-y-3">
          {goals.length === 0 && <p className="text-muted text-sm">{t("teacher.child.currentFocusEmpty")}</p>}
          {goals.map((g) => (
            <div key={g.id} className="border-line flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{g.statement}</p>
                <p className="text-muted text-sm">{g.successIndicator}</p>
                <p className="text-muted mt-1 text-xs">
                  {g.recentTotal > 0 ? t("teacher.child.progressLine", { helped: g.recentHelped, total: g.recentTotal }) : t("teacher.child.noOutcomes")} ·{" "}
                  {t("teacher.goals.review", { date: formatDate(g.reviewDate, locale) })}
                </p>
              </div>
              <ButtonLink href={`/teacher/studio?childId=${childId}&goalId=${g.id}`} size="sm">
                <Sparkles className="size-4" />
                {t("teacher.child.generate")}
              </ButtonLink>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("teacher.child.recentObservations")}
          action={
            <ButtonLink href={`${base}/observations/quick`} size="sm" variant="soft">
              <Zap className="size-4" />
              {t("teacher.observations.quick")}
            </ButtonLink>
          }
        />
        <CardBody>
          {observations.length === 0 && <p className="text-muted text-sm">{t("teacher.child.recentEmpty")}</p>}
          <ol className="border-line relative space-y-4 border-s ps-5">
            {observations.map((o) => (
              <li key={o.id}>
                <span className="bg-brand absolute -start-1.5 mt-1.5 size-3 rounded-full border-2 border-white" aria-hidden />
                <p className="text-muted text-xs">
                  {formatDate(o.observedAt, locale)} · {contextLabel(o.context, locale)}
                </p>
                <p className="text-sm">{o.observedBehavior}</p>
                {o.supportsTried.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {o.supportsTried.map((s) => (
                      <VocabChip key={s} category="SUPPORT" value={s} locale={locale} />
                    ))}
                    <Badge tone={o.supportOutcome === "helped" ? "green" : "neutral"}>{t(`enums.supportOutcome.${o.supportOutcome}`)}</Badge>
                  </p>
                )}
              </li>
            ))}
          </ol>
          <Link href={`${base}/observations`} className="text-brand mt-4 inline-block text-sm hover:underline">
            {t("common.more")} →
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}

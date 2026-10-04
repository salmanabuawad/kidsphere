import { ClipboardList, Zap } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/translate";
import { listObservations } from "@/server/services/observations";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { VocabChip } from "@/features/child-understanding/vocab-chip";
import { contextLabel, domainLabel } from "@/features/observations/definition";
import { SuggestButton } from "@/features/observations/suggest-button";

export default async function ObservationsPage({ params }: PageProps<"/teacher/children/[childId]/observations">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t, locale } = await getI18n();
  const observations = await listObservations(actor, childId);
  const base = `/teacher/children/${childId}/observations`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <ButtonLink href={`${base}/full`} variant="outline">
          <ClipboardList className="size-4" />
          {t("teacher.observations.full")}
        </ButtonLink>
        <ButtonLink href={`${base}/quick`}>
          <Zap className="size-4" />
          {t("teacher.observations.quick")}
        </ButtonLink>
      </div>
      {observations.length === 0 && <EmptyState title={t("teacher.observations.empty")} />}
      <div className="space-y-3">
        {observations.map((o) => {
          const details = (o.details ?? {}) as { antecedentTags?: string[]; strengthTags?: string[]; interestTags?: string[] };
          return (
            <Card key={o.id} className="p-5">
              <div className="text-muted flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={o.kind === "QUICK" ? "sky" : "violet"}>
                  {o.kind === "QUICK" ? t("teacher.observations.quick") : t("teacher.observations.full")}
                </Badge>
                <span>{formatDateTime(o.observedAt, locale)}</span>
                <span>· {contextLabel(o.context, locale)}</span>
                <span>· {t("teacher.observations.by", { name: o.authorName })}</span>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-muted text-xs font-medium tracking-wide uppercase">{t("teacher.observations.facts")}</p>
                  <p className="mt-1 text-sm">{o.observedBehavior}</p>
                  {o.frequencyOrDuration && <p className="text-muted mt-1 text-xs">⏱ {o.frequencyOrDuration}</p>}
                  {o.whatHappenedBefore && (
                    <p className="text-muted mt-1 text-xs">
                      {t("teacher.observations.before")}: {o.whatHappenedBefore}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted text-xs font-medium tracking-wide uppercase">{t("teacher.observations.interpretation")}</p>
                  <p className="mt-1 text-sm text-stone-600">{o.teacherNote ?? "—"}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {o.domains.map((d) => (
                  <Badge key={d.domain}>{domainLabel(d.domain, locale)}</Badge>
                ))}
                {o.supportsTried.map((s) => (
                  <VocabChip key={s} category="SUPPORT" value={s} locale={locale} />
                ))}
                {o.supportsTried.length > 0 && (
                  <Badge tone={o.supportOutcome === "helped" ? "green" : "neutral"}>{t(`enums.supportOutcome.${o.supportOutcome}` as MessageKey)}</Badge>
                )}
                {details.strengthTags?.map((s) => (
                  <VocabChip key={s} category="STRENGTH" value={s} locale={locale} />
                ))}
                {details.interestTags?.map((s) => (
                  <VocabChip key={s} category="INTEREST" value={s} locale={locale} />
                ))}
                {details.antecedentTags?.map((s) => (
                  <VocabChip key={s} category="TRIGGER" value={s} locale={locale} />
                ))}
              </div>
              {o.strengthNoticed && (
                <p className="mt-2 text-sm text-emerald-800">
                  ⭐ {t("teacher.observations.strength")}: {o.strengthNoticed}
                </p>
              )}
              <div className="mt-3 flex justify-end">
                <SuggestButton childId={childId} observationId={o.id} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

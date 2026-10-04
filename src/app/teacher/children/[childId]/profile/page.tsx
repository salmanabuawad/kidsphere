import type { AttributeCategory, ConfidenceLevel } from "@prisma/client";
import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { getInternalProfile, type ProfileAttributeView } from "@/server/services/profile";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { VocabChip } from "@/features/child-understanding/vocab-chip";
import { AddAttributeButton, AttributeActions } from "@/features/child-understanding/attribute-actions";
import { contextLabel } from "@/features/observations/definition";
import type { ObservationContext } from "@prisma/client";

const ORDER: AttributeCategory[] = [
  "STRENGTH",
  "INTEREST",
  "SUPPORT",
  "TRIGGER",
  "LEARNING_PREFERENCE",
  "EMOTIONAL_REGULATION",
  "SOCIAL_INTERACTION",
  "COMMUNICATION",
  "LANGUAGE",
  "EXECUTIVE_FUNCTION",
  "PLAY",
  "MOTOR",
  "INDEPENDENCE",
  "SENSORY",
  "FAMILY_PRIORITY",
];

const CONFIDENCE_TONE: Record<ConfidenceLevel, Tone> = {
  CORROBORATED: "green",
  OBSERVED: "sky",
  REPORTED: "neutral",
  EMERGING: "violet",
  RETIRED: "stone",
};

export default async function ProfilePage({ params }: PageProps<"/teacher/children/[childId]/profile">) {
  const actor = await requirePageActor(["TEACHER"]);
  const { childId } = await params;
  const { t, locale } = await getI18n();
  const { attributes } = await getInternalProfile(actor, childId);
  const pending = attributes.filter((a) => a.status === "PENDING_CONFIRMATION");
  const active = attributes.filter((a) => a.status === "ACTIVE");
  const retired = attributes.filter((a) => a.status === "RETIRED");

  const evidence = (a: ProfileAttributeView) => (
    <details className="group mt-1">
      <summary className="text-muted hover:text-ink cursor-pointer list-none text-xs">
        {t("common.sources")}: {t("teacher.profile.evidenceCount", { n: a.evidence.length })} ▾
      </summary>
      <ul className="border-line mt-1.5 space-y-1 border-s-2 ps-3">
        {a.evidence.map((e) => (
          <li key={e.id} className="text-xs text-stone-600" data-testid="evidence-item">
            <span className="font-medium">{t(`enums.source.${e.sourceType}`)}</span> — {formatDate(e.date, locale)}
            {e.sourceType === "TEACHER_OBSERVATION" && e.label && <span> · {contextLabel(e.label as ObservationContext, locale)}</span>}
            {e.sourceType === "OUTCOME" && e.label && <span> · {t(`enums.outcome.${e.label as "HELPED"}`)}</span>}
            {e.note && e.note !== "possible_pattern" && <span className="text-muted block">“{e.note}”</span>}
          </li>
        ))}
      </ul>
    </details>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("teacher.profile.title")}</h2>
          <p className="text-muted text-sm">{t("teacher.profile.subtitle")}</p>
        </div>
        <AddAttributeButton childId={childId} />
      </div>

      {pending.length > 0 && (
        <Card className="border-violet-200">
          <CardHeader title={t("teacher.profile.pending")} description={t("teacher.profile.pendingHint")} />
          <CardBody className="divide-line divide-y">
            {pending.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="pending-attribute">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted text-xs">{t(`enums.category.${a.category}`)}</span>
                    <VocabChip category={a.category} value={a.value} locale={locale} />
                    <Badge tone="violet">{t("enums.confidence.EMERGING")}</Badge>
                  </div>
                  {evidence(a)}
                </div>
                <AttributeActions childId={childId} attributeId={a.id} pending />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Alert tone="tip">{t("teacher.profile.strengthFirst")}</Alert>

      <div className="grid gap-4 md:grid-cols-2">
        {ORDER.map((category) => {
          const items = active.filter((a) => a.category === category);
          if (items.length === 0 && !["STRENGTH", "INTEREST", "SUPPORT"].includes(category)) return null;
          return (
            <Card key={category}>
              <CardHeader title={t(`enums.category.${category}`)} />
              <CardBody className="divide-line divide-y py-1">
                {items.length === 0 && <p className="text-muted py-3 text-sm">{t("teacher.profile.empty")}</p>}
                {items.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 py-3" data-testid={`attr-${a.value}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <VocabChip category={a.category} value={a.value} locale={locale} />
                        <Badge tone={CONFIDENCE_TONE[a.confidence]} className="tracking-wide uppercase">
                          <span data-testid="confidence">{t(`enums.confidence.${a.confidence}`)}</span>
                        </Badge>
                      </div>
                      {evidence(a)}
                    </div>
                    <AttributeActions childId={childId} attributeId={a.id} pending={false} />
                  </div>
                ))}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {retired.length > 0 && (
        <details className="border-line bg-card rounded-2xl border px-5 py-4">
          <summary className="text-muted cursor-pointer text-sm font-medium">
            {t("teacher.profile.retired")} ({retired.length})
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {retired.map((a) => (
              <span key={a.id} className="opacity-60">
                <VocabChip category={a.category} value={a.value} locale={locale} />
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

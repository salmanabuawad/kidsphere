import type { ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { MIN_OBSERVATIONS, NEEDS_MORE, type ReviewStatus, type ValidationStatus } from "./api";

const VALIDATION_TONE: Record<ValidationStatus, Tone> = {
  supported: "strength",
  partially_supported: "interest",
  needs_more_observation: "neutral",
  may_need_refinement: "attention",
};

const REVIEW_TONE: Record<ReviewStatus, Tone> = {
  improving: "strength",
  some_improvement: "interest",
  no_clear_change: "neutral",
  needs_more_observation: "neutral",
  no_longer_needed: "brand",
};

export const VALIDATION_ICON: Record<ValidationStatus, string> = {
  supported: "✅",
  partially_supported: "🌤️",
  needs_more_observation: "👀",
  may_need_refinement: "✏️",
};

export const REVIEW_ICON: Record<ReviewStatus, string> = {
  improving: "🌱",
  some_improvement: "🌤️",
  no_clear_change: "➖",
  needs_more_observation: "👀",
  no_longer_needed: "✅",
};

export const validationTone = (s: ValidationStatus): Tone => VALIDATION_TONE[s] ?? "neutral";
export const reviewTone = (s: ReviewStatus): Tone => REVIEW_TONE[s] ?? "neutral";

/** "Supported" / "Partly supported" / "Needs more observation" / "May need refinement". */
export function ValidationBadge({ status }: { status: ValidationStatus }) {
  const { t } = useI18n();
  return (
    <Badge tone={validationTone(status)} icon={<span aria-hidden>{VALIDATION_ICON[status]}</span>}>
      {t(`development.validation.status.${status}`)}
    </Badge>
  );
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const { t } = useI18n();
  return (
    <Badge tone={reviewTone(status)} icon={<span aria-hidden>{REVIEW_ICON[status]}</span>}>
      {t(`development.status.${status}`)}
    </Badge>
  );
}

/**
 * How many observations a judgement rests on, in words — never a score:
 * "No linked observations yet — keep observing", "Based on 2 observations — keep observing",
 * "Based on 4 observations".
 */
export function useEvidence() {
  const { t } = useI18n();
  return (count: number) => {
    if (count <= 0) return t("development.evidence.none");
    if (count < MIN_OBSERVATIONS) return t("development.evidence.limited", { count });
    return t("development.evidence.enough", { count });
  };
}

export function EvidenceText({ count, className }: { count: number; className?: string }) {
  const evidence = useEvidence();
  return <p className={className ?? "text-xs text-muted"}>{evidence(count)}</p>;
}

/** True when a chosen status claims more than the observations can carry (PLAN B6). */
export function isLimited(status: string | null | undefined, count: number) {
  return !!status && status !== NEEDS_MORE && count < MIN_OBSERVATIONS;
}

/** A labelled block inside a card: small heading + content (or a calm "nothing yet"). */
export function Section({ title, icon, children, empty }: { title: string; icon?: ReactNode; children?: ReactNode; empty?: boolean }) {
  const { t } = useI18n();
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-muted">
        {icon}
        {title}
      </h3>
      {empty ? <p className="text-sm text-muted">{t("development.sections.empty")}</p> : children}
    </section>
  );
}

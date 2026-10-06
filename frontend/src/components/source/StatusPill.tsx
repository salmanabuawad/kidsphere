import type { ReactNode } from "react";
import { Circle, CircleCheck, CircleDashed, Clock } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/Badge";
import { ToggleChip } from "@/components/ui/Chip";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/**
 * Section status (X-05): one per parent-questionnaire section, Quick Baseline and
 * teacher-observation domain. Stored as `{status, by, at}` (PSS.<sec>) and listed as
 * `section_statuses` in GET /api/options. A section with no data is not_started.
 * It is a word with a glyph, never a percentage or a count.
 */
export const SECTION_STATUSES = ["not_started", "in_progress", "sufficient", "review_later"] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

export function isSectionStatus(v: unknown): v is SectionStatus {
  return typeof v === "string" && (SECTION_STATUSES as readonly string[]).includes(v);
}

/** Missing or unknown → not_started ("no data = not started"). Accepts the stored {status} object too. */
export function normalizeStatus(v: unknown): SectionStatus {
  const s = typeof v === "object" && v !== null ? (v as { status?: unknown }).status : v;
  return isSectionStatus(s) ? s : "not_started";
}

/**
 * Wording of `sufficient`: "Sufficient observation" for teacher observation (default);
 * "Enough for now" for questionnaire answers (parent wizard steps, Parent View sections).
 */
export type StatusWording = "observation" | "answers";

const LOOK: Record<SectionStatus, { tone: Tone; icon: ReactNode }> = {
  not_started: { tone: "muted", icon: <Circle aria-hidden /> },
  in_progress: { tone: "brand", icon: <CircleDashed aria-hidden /> },
  sufficient: { tone: "success", icon: <CircleCheck aria-hidden /> },
  review_later: { tone: "attention", icon: <Clock aria-hidden /> },
};

/** i18n key of a status label (common.sectionStatus.*). */
export function statusLabelKey(status: SectionStatus, wording: StatusWording = "observation"): string {
  return status === "sufficient" && wording === "answers" ? "common.sectionStatus.sufficientAnswers" : `common.sectionStatus.${status}`;
}

/** Status pill for a section header or a domain card: glyph + word; screen readers hear "Status: …". */
export function StatusPill({
  status,
  wording = "observation",
  className,
}: {
  /** A section_statuses key, the stored {status} object, or nothing (= not started). */
  status?: SectionStatus | { status?: string | null } | string | null;
  wording?: StatusWording;
  className?: string;
}) {
  const { t } = useI18n();
  const s = normalizeStatus(status);
  const look = LOOK[s];
  return (
    <Badge tone={look.tone} icon={look.icon} className={className}>
      <span className="sr-only">{t("common.status")}: </span>
      <span data-status={s}>{t(statusLabelKey(s, wording))}</span>
    </Badge>
  );
}

/**
 * One-of-four status choice for the person filling a section ("Review later",
 * "Sufficient observation", …): a radiogroup of single-select chips.
 */
export function StatusPicker({
  value,
  onChange,
  wording = "observation",
  label,
  disabled,
  options = SECTION_STATUSES,
  className,
}: {
  value?: SectionStatus | string | null;
  onChange: (status: SectionStatus) => void;
  wording?: StatusWording;
  /** Accessible name of the group; defaults to "Section status". */
  label?: string;
  disabled?: boolean;
  /** Offer only some statuses (e.g. without not_started once there is data). */
  options?: readonly SectionStatus[];
  className?: string;
}) {
  const { t } = useI18n();
  const current = normalizeStatus(value);
  return (
    <div role="radiogroup" aria-label={label ?? t("common.sectionStatus.label")} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((s) => (
        <ToggleChip key={s} single selected={current === s} onToggle={() => onChange(s)} tone={s === "review_later" ? "attention" : "brand"} disabled={disabled}>
          {t(statusLabelKey(s, wording))}
        </ToggleChip>
      ))}
    </div>
  );
}

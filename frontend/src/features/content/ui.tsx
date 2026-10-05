/**
 * Small shared pieces of the content feature: type/mode icons, status chip,
 * "Made with templates" badge and the feedback result badge. Colours come only
 * from the shared tones (Badge/Chip) and theme tokens, so the app restyle applies.
 *
 * Content types share one paint (sky) so the colour has a single job, and the type
 * name is always shown next to the icon (spec 6.9).
 */
import type { ReactNode } from "react";
import { Check, Pencil, Sparkles, Wand } from "lucide-react";
import { Badge, type Tone } from "@/components/ui";
import {
  ActivityIcon,
  DidNotWorkIcon,
  GameIcon,
  GrowthSupportIcon,
  PackIcon,
  PartlyIcon,
  StoryIcon,
  StrengthBuilderIcon,
  VideoIcon,
  WorkedWellIcon,
  type KidIcon,
} from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import type { ContentStatus, FeedbackResult, GenerateType, Mode } from "./api";

export const TYPE_ICONS: Record<GenerateType, KidIcon> = {
  story: StoryIcon,
  video: VideoIcon,
  digital_game: GameIcon,
  real_world_activity: ActivityIcon,
  pack: PackIcon,
};

export const MODE_ICONS: Record<Mode, KidIcon> = { strength_builder: StrengthBuilderIcon, growth_support: GrowthSupportIcon };

/** "How did it go?": one neutral treatment, the same sun ball on all three towers (spec 6.11). */
export const RESULT_ICONS: Record<FeedbackResult, KidIcon> = { worked_well: WorkedWellIcon, partly: PartlyIcon, did_not_work: DidNotWorkIcon };

/** Draft is a muted tray badge with a pencil; Ready to use is the bordered "approved" badge with a check. */
const STATUS: Record<ContentStatus, { tone: Tone; icon?: ReactNode }> = {
  draft: { tone: "muted", icon: <Pencil aria-hidden /> },
  approved: { tone: "success", icon: <Check strokeWidth={2.5} aria-hidden /> },
  completed: { tone: "neutral", icon: <Check strokeWidth={2.5} aria-hidden /> },
  archived: { tone: "muted" },
};

export function typeKey(v: unknown): GenerateType {
  return v === "story" || v === "video" || v === "digital_game" || v === "real_world_activity" || v === "pack" ? v : "story";
}

/** Type icon (ink outline + sky paint) in a tray block: sm 36, md 48 (the inline tile), lg 56 (picker). */
export function TypeIcon({ type, size = "md", className }: { type: unknown; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = TYPE_ICONS[typeKey(type)];
  const box = { sm: "size-9 rounded-sm [&_svg]:size-6", md: "size-12 rounded-md [&_svg]:size-7", lg: "size-14 rounded-md [&_svg]:size-10" }[size];
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-tray text-ink", box, className)} aria-hidden>
      <Icon />
    </span>
  );
}

export function StatusChip({ status }: { status: unknown }) {
  const { t } = useI18n();
  const s = (["draft", "approved", "completed", "archived"] as const).find((x) => x === status) ?? "draft";
  return (
    <Badge tone={STATUS[s].tone} icon={STATUS[s].icon}>
      <span data-testid="content-status">{t(`content.status.${s}`)}</span>
    </Badge>
  );
}

/** Mode tag (spec 6.9): Strength Builder on strength-soft, Growth Support on focus-soft, each with its icon. */
export function ModeBadge({ mode }: { mode: unknown }) {
  const { t } = useI18n();
  if (mode !== "strength_builder" && mode !== "growth_support") return null;
  const Icon = MODE_ICONS[mode];
  return (
    <Badge tone={mode === "strength_builder" ? "strength" : "focus"} icon={<Icon size={16} aria-hidden />} className="[&_svg]:size-4">
      {t(`content.modes.${mode}`)}
    </Badge>
  );
}

/** "Made with templates" (no AI key) or "Made with AI". */
export function SourceBadge({ isTemplate }: { isTemplate: boolean | undefined }) {
  const { t } = useI18n();
  if (isTemplate === undefined) return null;
  return isTemplate ? (
    <Badge tone="neutral" icon={<Wand aria-hidden />}>
      <span data-testid="template-badge">{t("content.review.templateBadge")}</span>
    </Badge>
  ) : (
    <Badge tone="brand" icon={<Sparkles aria-hidden />}>
      {t("content.review.aiBadge")}
    </Badge>
  );
}

/** The feedback result in words with its tower icon; the same neutral tray for every outcome. */
export function ResultBadge({ result, prefix }: { result: FeedbackResult; prefix?: ReactNode }) {
  const { t } = useI18n();
  const Icon = RESULT_ICONS[result];
  return (
    <Badge tone="neutral" icon={<Icon size={16} aria-hidden />} className="[&_svg]:size-4">
      {prefix}
      {t(`content.results.${result}`)}
    </Badge>
  );
}

/**
 * A large, tappable picker tile (goal, focus, type): `surface`, a 1.5px line-strong
 * border, radius-lg; selected is brand-soft with a 2px brand border and a check block
 * at the top inline-end (radio-like; aria-pressed marks the selection).
 */
export function ChoiceTile({
  selected,
  onSelect,
  icon,
  title,
  hint,
  className,
  testId,
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={testId}
      className={cn(
        "ks-press relative flex min-h-16 w-full items-start gap-3 rounded-lg p-3 text-start transition-colors sm:p-4",
        selected ? "border-2 border-brand bg-brand-soft shadow-lip" : "border-[1.5px] border-line-strong bg-surface hover:shadow-lip-lg",
        className,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 pe-6">
        <span className="block text-base font-semibold text-ink" dir="auto">
          {title}
        </span>
        {hint && <span className="text-caption mt-0.5 block text-ink-muted">{hint}</span>}
      </span>
      {selected && (
        <span className="absolute end-2 top-2 flex size-6 items-center justify-center rounded-sm bg-brand text-on-brand" aria-hidden>
          <Check className="size-4" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}

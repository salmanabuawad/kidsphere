/**
 * Small shared pieces of the content feature: type/mode icons, status chip,
 * "Made with templates" badge and the feedback result badge. Colours come only
 * from the shared tones (Badge/Chip) and theme tokens, so the app restyle applies.
 */
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Blocks, BookOpen, Clapperboard, Gamepad2, Package, Sparkles, Sprout, Star, Wand } from "lucide-react";
import { Badge, type Tone } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { RESULT_EMOJI, type ContentStatus, type FeedbackResult, type GenerateType, type Mode } from "./api";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export const TYPE_ICONS: Record<GenerateType, IconType> = {
  story: BookOpen,
  video: Clapperboard,
  digital_game: Gamepad2,
  real_world_activity: Blocks,
  pack: Package,
};

export const MODE_ICONS: Record<Mode, IconType> = { strength_builder: Star, growth_support: Sprout };

const STATUS_TONE: Record<ContentStatus, Tone> = { draft: "attention", approved: "strength", completed: "interest", archived: "neutral" };
const RESULT_TONE: Record<FeedbackResult, Tone> = { worked_well: "strength", partly: "attention", did_not_work: "neutral" };

export function typeKey(v: unknown): GenerateType {
  return v === "story" || v === "video" || v === "digital_game" || v === "real_world_activity" || v === "pack" ? v : "story";
}

/** Type icon in a soft rounded square (size md = 44px). */
export function TypeIcon({ type, size = "md", className }: { type: unknown; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = TYPE_ICONS[typeKey(type)];
  const box = { sm: "size-9 rounded-xl [&_svg]:size-4", md: "size-11 rounded-2xl [&_svg]:size-5", lg: "size-14 rounded-2xl [&_svg]:size-7" }[size];
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-brand-soft text-brand", box, className)} aria-hidden>
      <Icon />
    </span>
  );
}

export function StatusChip({ status }: { status: unknown }) {
  const { t } = useI18n();
  const s = (["draft", "approved", "completed", "archived"] as const).find((x) => x === status) ?? "draft";
  return (
    <Badge tone={STATUS_TONE[s]} className="text-sm">
      <span data-testid="content-status">{t(`content.status.${s}`)}</span>
    </Badge>
  );
}

export function ModeBadge({ mode }: { mode: unknown }) {
  const { t } = useI18n();
  if (mode !== "strength_builder" && mode !== "growth_support") return null;
  const Icon = MODE_ICONS[mode];
  return (
    <Badge tone={mode === "strength_builder" ? "strength" : "helps"} icon={<Icon className="size-3.5" aria-hidden />}>
      {t(`content.modes.${mode}`)}
    </Badge>
  );
}

/** "Made with templates" (no AI key) or "Made with AI". */
export function SourceBadge({ isTemplate }: { isTemplate: boolean | undefined }) {
  const { t } = useI18n();
  if (isTemplate === undefined) return null;
  return isTemplate ? (
    <Badge tone="neutral" icon={<Wand className="size-3.5" aria-hidden />}>
      <span data-testid="template-badge">{t("content.review.templateBadge")}</span>
    </Badge>
  ) : (
    <Badge tone="brand" icon={<Sparkles className="size-3.5" aria-hidden />}>
      {t("content.review.aiBadge")}
    </Badge>
  );
}

export function ResultBadge({ result, prefix }: { result: FeedbackResult; prefix?: ReactNode }) {
  const { t } = useI18n();
  return (
    <Badge tone={RESULT_TONE[result]}>
      <span aria-hidden>{RESULT_EMOJI[result]}</span>
      {prefix}
      {t(`content.results.${result}`)}
    </Badge>
  );
}

/** A large, tappable choice card (goal, focus, type tiles). aria-pressed marks the selection. */
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
        "flex min-h-16 w-full items-start gap-3 rounded-[var(--radius-card)] border-2 bg-card p-4 text-start shadow-[var(--shadow-card)] transition-colors",
        selected ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40",
        className,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-ink" dir="auto">
          {title}
        </span>
        {hint && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
      </span>
    </button>
  );
}

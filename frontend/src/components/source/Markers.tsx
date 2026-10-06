import type { ReactNode } from "react";
import { EyeOff, Minus } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/**
 * Muted markers for an explicit gap (X-02): a parent question that was skipped
 * ("Not answered", `not_answered[]`) and a teacher item with no observation yet
 * ("Not observed yet", level not_observed). They are distinct from a section that was
 * never reached (StatusPill not_started) and never read as a negative.
 */
function Marker({ icon, label, marker, className }: { icon: ReactNode; label: string; marker: string; className?: string }) {
  return (
    <span className={cn("text-caption inline-flex items-center gap-1 text-ink-muted [&_svg]:size-3.5 [&_svg]:shrink-0", className)} data-marker={marker}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

export function NotAnswered({ className }: { className?: string }) {
  const { t } = useI18n();
  return <Marker icon={<Minus aria-hidden />} label={t("common.notAnswered")} marker="not-answered" className={className} />;
}

export function NotObserved({ className }: { className?: string }) {
  const { t } = useI18n();
  return <Marker icon={<EyeOff aria-hidden />} label={t("common.notObserved")} marker="not-observed" className={className} />;
}

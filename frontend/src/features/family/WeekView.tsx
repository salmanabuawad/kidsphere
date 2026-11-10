/** One week of a family program: topic, short lesson, what to try at home. Shared by parent and teacher views. */
import { BookOpen, Home } from "lucide-react";
import { pick } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import type { ProgramWeek } from "./api";

export function WeekView({ week, n, total }: { week: ProgramWeek; n: number; total: number }) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-3" data-testid="journey-week">
      <p className="text-caption font-semibold text-ink-muted">{t("family.weekOf", { n, total })}</p>
      <h3 className="font-display text-title font-semibold text-ink" dir="auto">
        {pick(week.topic, locale)}
      </h3>
      <p className="flex items-start gap-2 leading-relaxed text-ink" dir="auto">
        <BookOpen className="mt-1 size-4 shrink-0 text-ink-muted" aria-hidden />
        <span>{pick(week.lesson, locale)}</span>
      </p>
      <div className="rounded-md bg-helps-soft p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Home className="size-4" aria-hidden />
          {t("family.tryAtHome")}
        </p>
        <p className="mt-1 text-ink" dir="auto">
          {pick(week.try_at_home, locale)}
        </p>
      </div>
    </div>
  );
}

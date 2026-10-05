import { useMemo, type ReactNode } from "react";
import { Clock, Eye, HeartHandshake, ListChecks, Package, Printer, Target } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { contentDir, usePlayerText, type Dir } from "./content-locale";
import { parseActivity } from "./parse";
import { PlayerFallback } from "./PlayerFallback";
import type { Activity } from "./types";
import "./print.css";

export type ActivityCardProps = {
  activity: Activity;
  /** Content language: drives direction and the section headings. */
  lang: AppLocale;
  dir?: Dir;
  /** Show the Print button (default true). */
  printable?: boolean;
  className?: string;
};

function Section({ icon, title, children, tone }: { icon: ReactNode; title: string; children: ReactNode; tone: string }) {
  return (
    <section className="space-y-2">
      <h3 className={cn("flex items-center gap-2 text-base font-semibold", tone)}>
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Teacher-facing real-world activity: goal, duration, materials, numbered
 * steps, what to observe and an adaptation. Prints cleanly on its own
 * (print.css hides the rest of the page).
 */
export function ActivityCard({ activity: raw, lang, dir: dirProp, printable = true, className }: ActivityCardProps) {
  const t = usePlayerText(lang);
  const dir = contentDir(lang, dirProp);
  const activity = useMemo(() => parseActivity(raw), [raw]);

  if (!activity)
    return (
      <div dir={dir} lang={lang}>
        <PlayerFallback lang={lang} />
      </div>
    );

  return (
    <article
      dir={dir}
      lang={lang}
      className={cn("ks-print-area mx-auto w-full max-w-3xl space-y-6 rounded-[var(--radius-card)] border border-line bg-card p-6 shadow-[var(--shadow-card)] md:p-8", className)}
      data-testid="activity-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h2 dir="auto" className="text-2xl font-bold text-ink md:text-3xl">
            {activity.title}
          </h2>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">
            <Clock className="size-4" aria-hidden />
            {t("player.activity.minutes", { count: activity.duration_minutes })}
          </p>
        </div>
        {printable && (
          <button
            type="button"
            onClick={() => window.print()}
            className="ks-no-print inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-medium text-ink hover:bg-stone-50 print:hidden"
            data-testid="activity-print"
          >
            <Printer className="size-4" aria-hidden />
            {t("player.activity.print")}
          </button>
        )}
      </header>

      <Section icon={<Target className="size-5" />} title={t("player.activity.goal")} tone="text-brand">
        <p dir="auto" className="text-lg leading-relaxed">
          {activity.goal}
        </p>
      </Section>

      <Section icon={<Package className="size-5" />} title={t("player.activity.materials")} tone="text-interest">
        {activity.materials.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {activity.materials.map((m, i) => (
              <li key={i} dir="auto" className="rounded-full bg-sky-50 px-3 py-1.5 text-sky-900 ring-1 ring-sky-200">
                {m}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{t("player.activity.noMaterials")}</p>
        )}
      </Section>

      <Section icon={<ListChecks className="size-5" />} title={t("player.activity.steps")} tone="text-ink">
        <ol className="space-y-3">
          {activity.instructions.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
              <p dir="auto" className="pt-0.5 text-lg leading-relaxed">
                {s}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={<Eye className="size-5" />} title={t("player.activity.observe")} tone="text-helps">
        <ul className="space-y-2">
          {activity.what_to_observe.map((s, i) => (
            <li key={i} className="flex items-start gap-2 rounded-xl bg-violet-50 p-3 text-violet-950">
              <span aria-hidden>👀</span>
              <p dir="auto">{s}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={<HeartHandshake className="size-5" />} title={t("player.activity.adaptation")} tone="text-attention">
        <p dir="auto" className="rounded-xl bg-amber-50 p-3 leading-relaxed text-amber-950">
          {activity.adaptation}
        </p>
      </Section>
    </article>
  );
}

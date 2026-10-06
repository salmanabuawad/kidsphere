import { useMemo, type ReactNode } from "react";
import { Clock, ListChecks, Printer } from "lucide-react";
import { ActivityIcon, AttentionIcon, CurrentFocusIcon, PackIcon, WhatHelpsIcon } from "@/icons";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { castDeep, useCast } from "./cast";
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

/** A section of the card: a 32px tile with its icon, then the heading in ink (never tone-coloured). */
function Section({ icon, title, children, tile = "bg-tray" }: { icon: ReactNode; title: string; children: ReactNode; tile?: string }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-3 text-base font-semibold text-ink">
        <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-sm text-ink [&_svg]:size-5", tile)}>
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
  const cast = useCast();
  const activity = useMemo(() => {
    const parsed = parseActivity(raw);
    return parsed ? castDeep(parsed, cast) : null;
  }, [raw, cast]);

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
      className={cn("ks-print-area mx-auto w-full max-w-3xl space-y-6 rounded-lg border border-line bg-surface p-6 md:p-8", className)}
      data-testid="activity-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-md bg-tray text-ink">
            <ActivityIcon className="size-7" />
          </span>
          <div className="min-w-0 space-y-2">
            <h2 dir="auto" className="font-display text-display-lg font-semibold text-ink">
              {activity.title}
            </h2>
            <p className="tabular inline-flex items-center gap-1.5 rounded-sm bg-tray px-2.5 py-1 text-sm font-medium text-ink">
              <Clock className="size-4 text-ink-muted" aria-hidden />
              {t("player.activity.minutes", { count: activity.duration_minutes })}
            </p>
          </div>
        </div>
        {printable && (
          <button
            type="button"
            onClick={() => window.print()}
            className="ks-no-print ks-press inline-flex h-11 items-center gap-2 rounded-md border-[1.5px] border-line-strong bg-surface px-4 text-base font-semibold text-ink shadow-lip hover:bg-tray active:translate-y-0.5 active:shadow-none print:hidden"
            data-testid="activity-print"
          >
            <Printer className="size-5" aria-hidden />
            {t("player.activity.print")}
          </button>
        )}
      </header>

      <Section icon={<CurrentFocusIcon />} title={t("player.activity.goal")} tile="bg-focus-soft">
        <p dir="auto" className="text-lg leading-relaxed text-ink">
          {activity.goal}
        </p>
      </Section>

      <Section icon={<PackIcon />} title={t("player.activity.materials")}>
        {activity.materials.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {activity.materials.map((m, i) => (
              <li key={i} dir="auto" className="rounded-sm bg-tray px-3 py-1.5 text-ink">
                {m}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">{t("player.activity.noMaterials")}</p>
        )}
      </Section>

      <Section icon={<ListChecks />} title={t("player.activity.steps")}>
        <ol className="space-y-3">
          {activity.instructions.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="font-display tabular flex size-8 shrink-0 items-center justify-center rounded-sm bg-brand text-base font-bold text-on-brand">{i + 1}</span>
              <p dir="auto" className="pt-0.5 text-lg leading-relaxed text-ink">
                {s}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={<AttentionIcon />} title={t("player.activity.observe")}>
        <ul className="space-y-2">
          {activity.what_to_observe.map((s, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md bg-tray p-3 text-ink">
              <AttentionIcon size={16} className="mt-1 shrink-0" aria-hidden />
              <p dir="auto">{s}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={<WhatHelpsIcon />} title={t("player.activity.adaptation")} tile="bg-helps-soft">
        <p dir="auto" className="rounded-md bg-helps-soft p-3 leading-relaxed text-ink">
          {activity.adaptation}
        </p>
      </Section>
    </article>
  );
}

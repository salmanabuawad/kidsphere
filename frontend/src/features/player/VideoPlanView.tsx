import { useMemo, type ReactNode } from "react";
import { Clapperboard, Clock, Film, Info, Mic, Sparkles, Target } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { contentDir, usePlayerText, type Dir } from "./content-locale";
import { parseVideoPlan } from "./parse";
import { PlayerFallback } from "./PlayerFallback";
import type { VideoPlan, VideoStatus } from "./types";

export type VideoPlanViewProps = {
  plan: VideoPlan;
  /** Content language: drives direction and the headings. */
  lang: AppLocale;
  dir?: Dir;
  /** generated_content.video_status; shown as a badge. Defaults to script_ready. */
  status?: VideoStatus;
  /**
   * Note slot under the header. Defaults to the "video provider not connected
   * yet" message while the status is script_ready; pass null to hide it.
   */
  notice?: ReactNode | null;
};

const STATUS_TONE: Record<VideoStatus, string> = {
  script_ready: "bg-sky-50 text-sky-800 ring-sky-200",
  generating: "bg-violet-50 text-violet-800 ring-violet-200",
  ready: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  failed: "bg-amber-50 text-amber-800 ring-amber-200",
};

/** Teacher-facing video plan: learning goal, script and the scene list. */
export function VideoPlanView({ plan: raw, lang, dir: dirProp, status = "script_ready", notice }: VideoPlanViewProps) {
  const t = usePlayerText(lang);
  const dir = contentDir(lang, dirProp);
  const plan = useMemo(() => parseVideoPlan(raw), [raw]);

  if (!plan)
    return (
      <div dir={dir} lang={lang}>
        <PlayerFallback lang={lang} />
      </div>
    );

  const note = notice === undefined ? (status === "script_ready" ? t("player.video.providerNotConnected") : null) : notice;

  return (
    <article
      dir={dir}
      lang={lang}
      className="mx-auto w-full max-w-3xl space-y-6 rounded-[var(--radius-card)] border border-line bg-card p-6 shadow-[var(--shadow-card)] md:p-8"
      data-testid="video-plan"
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_TONE[status])}
            data-testid="video-status"
          >
            <Film className="size-3.5" aria-hidden />
            {t(`player.video.status.${status}`)}
          </span>
          <span className="inline-flex items-center gap-1 text-sm text-muted">
            <Clock className="size-4" aria-hidden />
            {t("player.video.duration", { count: plan.duration_seconds })}
          </span>
        </div>
        <h2 dir="auto" className="text-2xl font-bold text-ink md:text-3xl">
          {plan.title}
        </h2>
        <p className="flex items-start gap-2 text-lg">
          <Target className="mt-1 size-5 shrink-0 text-brand" aria-label={t("player.video.learningGoal")} />
          <span dir="auto">{plan.learning_goal}</span>
        </p>
      </header>

      {note && (
        <div className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sky-900 ring-1 ring-sky-200" data-testid="video-notice">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>{note}</div>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Mic className="size-5 text-helps" aria-hidden />
          {t("player.video.script")}
        </h3>
        <p dir="auto" className="rounded-xl bg-surface-2 p-4 leading-relaxed whitespace-pre-line">
          {plan.script}
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <Clapperboard className="size-5 text-interest" aria-hidden />
          {t("player.video.scenes")}
        </h3>
        <ol className="space-y-3">
          {plan.scenes.map((s, i) => (
            <li key={i} className="space-y-2 rounded-2xl border border-line p-4" data-testid="video-scene">
              <p className="text-sm font-semibold text-brand">{t("player.video.scene", { n: i + 1 })}</p>
              <p dir="auto" className="font-medium">
                {s.description}
              </p>
              <p className="flex items-start gap-2 text-stone-700">
                <Mic className="mt-1 size-4 shrink-0" aria-label={t("player.video.narration")} />
                <span dir="auto">{s.narration}</span>
              </p>
              <p className="flex items-start gap-2 text-sm text-muted">
                <Sparkles className="mt-0.5 size-4 shrink-0" aria-label={t("player.video.visualPrompt")} />
                <span dir="auto">{s.visual_prompt}</span>
              </p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

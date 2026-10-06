import { useMemo, type ReactNode } from "react";
import { Clock, Film, Info, Mic, Sparkles } from "lucide-react";
import { CurrentFocusIcon, VideoIcon } from "@/icons";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { castDeep, useCast } from "./cast";
import { contentDir, usePlayerText, type Dir } from "./content-locale";
import { Pic } from "./kid-ui";
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

/** Status words on calm fills (spec 6.4): processing is brand, ready is the bordered success badge, a failure is worth a look. */
const STATUS_TONE: Record<VideoStatus, string> = {
  script_ready: "bg-tray text-ink",
  generating: "bg-brand-soft text-brand",
  ready: "border-[1.5px] border-success bg-surface text-success",
  failed: "bg-attention-soft text-ink",
};

/**
 * Teacher-facing video plan: learning goal, script and the scene list. People of the
 * child's life (CastProvider) appear by name, with their photos on the scenes that mention them.
 */
export function VideoPlanView({ plan: raw, lang, dir: dirProp, status = "script_ready", notice }: VideoPlanViewProps) {
  const t = usePlayerText(lang);
  const dir = contentDir(lang, dirProp);
  const cast = useCast();
  const parsed = useMemo(() => parseVideoPlan(raw), [raw]);
  const photos = useMemo(() => parsed?.scenes.map((sc) => cast.photos(sc.narration)) ?? [], [parsed, cast]);
  const plan = useMemo(() => (parsed ? castDeep(parsed, cast) : null), [parsed, cast]);

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
      className="mx-auto w-full max-w-3xl space-y-6 rounded-lg border border-line bg-surface p-6 md:p-8"
      data-testid="video-plan"
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn("text-caption inline-flex min-h-6 items-center gap-1 rounded-sm px-2 font-medium", STATUS_TONE[status])}
            data-testid="video-status"
          >
            <Film className="size-3.5" aria-hidden />
            {t(`player.video.status.${status}`)}
          </span>
          <span className="tabular inline-flex items-center gap-1 text-sm text-ink-muted">
            <Clock className="size-4" aria-hidden />
            {t("player.video.duration", { count: plan.duration_seconds })}
          </span>
        </div>
        <h2 dir="auto" className="font-display text-display-lg font-semibold text-ink">
          {plan.title}
        </h2>
        <p className="flex items-start gap-2 text-lg">
          <CurrentFocusIcon className="mt-1 size-5 shrink-0 text-ink" aria-label={t("player.video.learningGoal")} />
          <span dir="auto">{plan.learning_goal}</span>
        </p>
      </header>

      {note && (
        <div className="flex items-start gap-3 rounded-md bg-brand-soft px-4 py-3 text-ink" data-testid="video-notice">
          <Info className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div>{note}</div>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Mic className="size-5 text-ink-muted" aria-hidden />
          {t("player.video.script")}
        </h3>
        <p dir="auto" className="rounded-md bg-tray p-4 leading-relaxed whitespace-pre-line">
          {plan.script}
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <VideoIcon className="size-6" aria-hidden />
          {t("player.video.scenes")}
        </h3>
        <ol className="space-y-3">
          {plan.scenes.map((s, i) => (
            <li key={i} className="space-y-2 rounded-lg border border-line p-4" data-testid="video-scene">
              <div className="flex items-center gap-2">
                {s.emoji && <Pic emoji={s.emoji} className="text-2xl" />}
                <p className="tabular text-sm font-semibold text-brand">{t("player.video.scene", { n: i + 1 })}</p>
                {(photos[i] ?? []).map((src) => (
                  <Pic key={src} photo={src} className="text-3xl" />
                ))}
              </div>
              <p dir="auto" className="font-medium">
                {s.description}
              </p>
              <p className="flex items-start gap-2 text-ink">
                <Mic className="mt-1 size-4 shrink-0" aria-label={t("player.video.narration")} />
                <span dir="auto">{s.narration}</span>
              </p>
              <p className="flex items-start gap-2 text-sm text-ink-muted">
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

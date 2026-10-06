import { Check, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { themeLook } from "@/lib/kindergarten";

/**
 * Shown once on the profile right after a quick observation was saved: three blocks drop
 * into a small tower (a sky block, a block in the kindergarten's paint, a sun ball) beside a
 * "Saved" mark and one plain line. It moves once and then rests; Close removes it. It
 * describes the observation, never the child.
 */
export function SavedCelebration({ name, theme, onClose }: { name: string; theme: string | null; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <section
      role="status"
      className="animate-placed mb-5 flex items-center gap-4 rounded-xl border border-line bg-surface p-4 md:p-5"
      data-testid="saved-celebration"
    >
      <svg aria-hidden viewBox="0 0 120 100" className="h-20 w-24 shrink-0" fill="none" stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="88" width="108" height="10" rx="5" className="fill-tray" />
        <rect x="30" y="62" width="60" height="26" rx="6" className="animate-drop fill-paint-sky" />
        <rect x="40" y="38" width="40" height="24" rx="6" className={`animate-drop ${themeLook(theme).fill}`} style={{ animationDelay: "120ms" }} />
        <circle cx="60" cy="24" r="13" className="animate-drop fill-paint-sun" style={{ animationDelay: "240ms" }} />
      </svg>
      <div className="min-w-0 flex-1">
        <p
          className="animate-placed text-caption inline-flex min-h-7 items-center gap-1.5 rounded-sm border-[1.5px] border-success bg-surface px-2.5 font-semibold text-success"
          style={{ animationDelay: "320ms" }}
        >
          <Check className="size-4" strokeWidth={3} aria-hidden />
          {t("children.saved.badge")}
        </p>
        <p className="font-display text-title mt-1.5 font-semibold text-ink" dir="auto">
          {t("children.saved.title", { name })}
        </p>
        <p className="text-sm text-ink-muted">{t("children.saved.hint")}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        title={t("common.close")}
        className="inline-flex size-11 shrink-0 items-center justify-center self-start rounded-md text-ink-muted transition-colors hover:bg-tray hover:text-ink"
      >
        <X className="size-5" aria-hidden />
      </button>
    </section>
  );
}

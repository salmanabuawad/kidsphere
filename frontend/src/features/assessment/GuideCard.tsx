import { useEffect, useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui";
import { pick, type Localized } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { useSourceModel } from "@/lib/sourceModel";
import { cn } from "@/lib/utils";

const SEEN_KEY = "ks_to_guide_seen";

function seenBefore(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * "How to observe" (observation-model section ב): the 7 principles as one-liners, the
 * guiding question and the not-a-diagnosis note. Open on the first visit (remembered on
 * this device), then one line that opens it again.
 */
export function GuideCard() {
  const { t, locale } = useI18n();
  const { list, labelOf } = useOptions();
  const sm = useSourceModel();
  const [open, setOpen] = useState(() => !seenBefore());
  useEffect(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage blocked: the card simply opens again next time */
    }
  }, []);
  const meta = sm.registry("observation_model")?.meta ?? {};
  const motto = pick(meta.motto as Localized | undefined, locale);
  const principles = list("observation_principles");
  return (
    <Card className="bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-4 py-2 text-start md:px-5"
      >
        <span className="flex items-center gap-2 font-semibold text-ink">
          <Lightbulb className="size-5 text-ink-muted" aria-hidden />
          {t("assessment.guide.title")}
        </span>
        <ChevronDown className={cn("size-5 text-ink-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-4 py-4 md:px-5">
          <ul className="space-y-2">
            {principles.map((p) => (
              <li key={p.key} className="flex items-start gap-2 text-sm text-ink">
                <span aria-hidden className="text-base leading-5">
                  {p.icon ?? "•"}
                </span>
                <span dir="auto">{labelOf(p)}</span>
              </li>
            ))}
          </ul>
          {motto && (
            <p className="rounded-md bg-tray px-3 py-2 text-sm font-medium text-ink" dir="auto">
              {motto}
            </p>
          )}
          <p className="text-caption text-ink-muted">{t("assessment.guide.notDiagnostic")}</p>
        </div>
      )}
    </Card>
  );
}

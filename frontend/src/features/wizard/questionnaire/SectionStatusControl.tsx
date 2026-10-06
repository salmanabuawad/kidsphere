import { StatusPicker, normalizeStatus, type SectionStatus } from "@/components/source";
import { useI18n } from "@/i18n/I18nProvider";
import { useAction } from "@/lib/useAction";
import type { QProfile } from "./model";
import { patchProfile } from "./useQuestionnaire";

/**
 * Staff set the status of a questionnaire section (In progress / Enough for now / Review later):
 * a status-only PATCH, so the family's answers stay exactly as they were given. "Review later"
 * then shows in the Overview prompts. Used by the Parent View and by the questionnaire wizard
 * when staff fill it in for the family or together at a meeting.
 */
export function SectionStatusControl({
  childId,
  section,
  value,
  onSaved,
}: {
  childId: string;
  /** The data section key (PP.<section>). */
  section: string;
  value: string | undefined;
  onSaved: (p: QProfile) => void;
}) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const change = async (status: SectionStatus) => {
    if (status === normalizeStatus(value)) return;
    const r = await run(() => patchProfile(childId, { perspective: "parent", section, status }), { success: t("parentView.statusSaved") });
    if (r.ok) onSaved(r.data);
  };
  return (
    <div className="space-y-1.5 border-t border-line pt-3" data-testid="section-status">
      <p className="text-caption font-semibold text-ink-muted">{t("parentView.statusLabel")}</p>
      <StatusPicker
        label={t("parentView.statusLabel")}
        value={value}
        onChange={(s) => void change(s)}
        wording="answers"
        disabled={pending}
        options={["in_progress", "sufficient", "review_later"]}
      />
    </div>
  );
}

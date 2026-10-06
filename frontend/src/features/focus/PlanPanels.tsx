import { ArrowUpRight, Plus } from "lucide-react";
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, Chip } from "@/components/ui";
import { ProvenanceBadges } from "@/components/source";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import type { FamilyHopes, NeedCandidate } from "./api";

/** The questionnaire's develop areas map onto the focus categories of the same name. */
const AREA_CATEGORY: Record<string, string> = {
  emotional: "emotional",
  social: "social",
  language: "language",
  motor: "motor",
  independence: "independence",
  other: "other",
};

/**
 * "Family hopes" (X-35; questionnaire יא): what the family would like the child to develop and how
 * they hope the child feels. PARENT SAID. Suggestions only: a tap opens "Add a goal" preset to that
 * area; nothing is ever created by itself.
 */
export function FamilyHopesPanel({ hopes, full, onUse }: { hopes: FamilyHopes; full: boolean; onUse: (category: string) => void }) {
  const { t } = useI18n();
  const { optionLabel, item } = useOptions();
  const areaLabel = (area: string, label: string | null) => (area === "other" ? label || optionLabel("priority_categories", "other") : optionLabel("priority_categories", area));
  return (
    <Card data-testid="family-hopes">
      <CardHeader title={t("focus.hopes.title")} description={t("focus.hopes.hint")} action={<ProvenanceBadges kinds={hopes.provenance} />} />
      <CardBody className="space-y-4">
        {hopes.develop.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-ink-muted">{t("focus.hopes.develop")}</h4>
            <ul className="space-y-2">
              {hopes.develop.map((h) => (
                <li key={`${h.area}-${h.label ?? ""}`} className="flex flex-wrap items-start justify-between gap-2 rounded-sm bg-tray/50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink" dir="auto">
                      {areaLabel(h.area, h.label)}
                    </p>
                    {h.text && (
                      <p className="text-sm text-ink" dir="auto">
                        {h.text}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden />} disabled={full} onClick={() => onUse(AREA_CATEGORY[h.area] ?? "other")}>
                    {t("focus.hopes.use")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {hopes.develop.length === 0 && hopes.categories.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-ink-muted">{t("focus.hopes.areas")}</h4>
            <ul className="flex flex-wrap gap-2">
              {hopes.categories.map((c) => (
                <li key={c}>
                  <Chip tone="neutral" icon={item("priority_categories", c)?.icon}>
                    {optionLabel("priority_categories", c)}
                  </Chip>
                </li>
              ))}
            </ul>
            {hopes.note && (
              <p className="text-sm text-ink" dir="auto">
                {hopes.note}
              </p>
            )}
          </section>
        )}
        {(hopes.hope_child_feels.length > 0 || hopes.hope_other) && (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-ink-muted">{t("focus.hopes.feel")}</h4>
            <ul className="flex flex-wrap gap-2">
              {hopes.hope_child_feels.map((k) => (
                <li key={k}>
                  <Chip tone="neutral" icon={item("hope_child_feels", k)?.icon}>
                    {optionLabel("hope_child_feels", k)}
                  </Chip>
                </li>
              ))}
              {hopes.hope_other && (
                <li>
                  <Chip tone="neutral">
                    <span dir="auto">{t("focus.hopes.other", { text: hopes.hope_other })}</span>
                  </Chip>
                </li>
              )}
            </ul>
          </section>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Domain 13 candidates (X-36): the priority needs the teacher noted in the observation cycle.
 * TEACHER OBSERVED. "Make it a goal" creates the goal through the teacher-observation endpoint.
 */
export function NeedsPanel({
  childId,
  candidates,
  full,
  busy,
  onPromote,
}: {
  childId: string;
  candidates: NeedCandidate[];
  full: boolean;
  busy: boolean;
  onPromote: (c: NeedCandidate) => void;
}) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  return (
    <Card data-testid="need-candidates">
      <CardHeader
        title={t("focus.needs.title")}
        description={t("focus.needs.hint")}
        action={<ProvenanceBadges kinds={candidates[0]?.provenance ?? ["teacher_observed"]} />}
      />
      <CardBody className="space-y-3">
        <ul className="space-y-2">
          {candidates.map((c) => (
            <li key={`${c.assessment_id}-${c.index}`} data-testid="need-candidate" className="flex flex-wrap items-start justify-between gap-2 rounded-sm bg-tray/50 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{optionLabel("need_areas", c.area)}</p>
                {c.seeing && (
                  <p className="text-sm text-ink" dir="auto">
                    {c.seeing}
                  </p>
                )}
                {c.how_often && (
                  <p className="text-caption text-ink-muted" dir="auto">
                    {t("focus.needs.often", { text: c.how_often })}
                  </p>
                )}
              </div>
              {c.focus_area_id ? (
                <Badge tone="success">{t("focus.needs.promoted")}</Badge>
              ) : (
                <Button size="sm" variant="outline" icon={<Plus className="size-4" aria-hidden />} disabled={full || busy} onClick={() => onPromote(c)}>
                  {t("focus.needs.promote")}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <ButtonLink size="sm" variant="ghost" to={paths.childTeacherObservation(childId, { domain: "priority_needs" })} icon={<ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden />}>
          {t("focus.needs.open")}
        </ButtonLink>
      </CardBody>
    </Card>
  );
}

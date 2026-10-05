import { useNavigate } from "react-router";
import { ArrowLeft, ClipboardCheck, Flag, Pencil } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PageSkeleton } from "@/components/ui/Spinner";
import type { Tone } from "@/components/ui/Badge";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { createBaseline, focusListUrl, type FocusArea, type MergedItem } from "./api";
import { STEPS, TOTAL_STEPS } from "./definition";
import type { WizardProfile } from "./WizardEngine";
import { DoneMark, WizardActions, WizardProgress } from "./WizardFrame";

const LISTS: { name: "strengths" | "interests" | "what_helps" | "sensitivities"; tone: Tone; list: string }[] = [
  { name: "strengths", tone: "strength", list: "strengths" },
  { name: "interests", tone: "interest", list: "interests" },
  { name: "what_helps", tone: "helps", list: "what_helps" },
  { name: "sensitivities", tone: "attention", list: "sensitivities" },
];

export function MergedChips({ items, tone, list }: { items: MergedItem[]; tone: Tone; list: string }) {
  const { t } = useI18n();
  const { item, labelOf } = useOptions();
  if (!items.length) return <p className="text-sm text-muted">{t("wizard.review.empty")}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => {
        const opt = i.key ? item(i.list ?? list, i.key) : undefined;
        return (
          <Chip key={i.key ?? `c:${i.custom}`} tone={tone} icon={opt?.icon}>
            {opt ? labelOf(opt) : (i.custom ?? i.key)}
          </Chip>
        );
      })}
    </div>
  );
}

/** Staff: summary of both perspectives + Current Focus, then "Create baseline". */
export function ReviewStep({ childId, wiz, onPick }: { childId: string; wiz: WizardProfile; onPick: (step: number) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { optionLabel } = useOptions();
  const focus = useFetch<{ focus_areas: FocusArea[] }>(focusListUrl(childId), { status: "active" });
  const { pending, run } = useAction();
  const profile = wiz.data;
  if (!profile) return <PageSkeleton />;

  const answered = (who: "parent" | "teacher", section: string) => {
    const p = who === "parent" ? profile.parent_perspective : profile.teacher_perspective;
    return !!p?.entered?.[section as keyof typeof p.entered]?.length;
  };

  async function finish() {
    const r = await run(() => createBaseline(childId), { success: t("wizard.review.created") });
    if (r.ok) navigate(paths.child(childId));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <WizardProgress current={TOTAL_STEPS + 1} total={TOTAL_STEPS} onPick={(n) => onPick(n)} />
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand" aria-hidden>
          <ClipboardCheck className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("wizard.review.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("wizard.review.intro")}</p>
        </div>
      </div>

      {LISTS.map((l) => (
        <Card key={l.name}>
          <CardHeader title={t(`wizard.review.lists.${l.name}`)} />
          <CardBody>
            <MergedChips items={profile[l.name] ?? []} tone={l.tone} list={l.list} />
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader icon={<Flag className="size-4" />} title={t("wizard.focus.title")} />
        <CardBody>
          {focus.data?.focus_areas.length ? (
            <ol className="space-y-2">
              {focus.data.focus_areas.map((f, i) => (
                <li key={f.id} className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="font-medium text-ink" dir="auto">
                    {f.title}
                  </span>
                  <Chip tone="attention">{optionLabel("priority_categories", f.category)}</Chip>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">{t("wizard.focus.none")}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("wizard.review.answered")} description={t("wizard.review.answeredHint")} />
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-5 py-2 text-start font-medium">{t("wizard.review.step")}</th>
                <th className="px-2 py-2 font-medium">{t("wizard.perspective.parent")}</th>
                <th className="px-2 py-2 font-medium">{t("wizard.perspective.teacher")}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {STEPS.map((s) => (
                <tr key={s.step}>
                  <td className="px-5 py-2 text-ink">{t(`wizard.steps.${s.key}.short`)}</td>
                  <td className="px-2 py-2 text-center">
                    <DoneMark on={answered("parent", s.section)} label={t("wizard.perspective.parent")} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <DoneMark on={answered("teacher", s.section)} label={t("wizard.perspective.teacher")} />
                  </td>
                  <td className="px-2 py-2 text-end">
                    <Button variant="ghost" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => onPick(s.step)}>
                      {t("common.edit")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {profile.has_baseline && <Alert tone="info">{t("wizard.review.newBaselineHint")}</Alert>}

      <WizardActions>
        <Button variant="ghost" icon={<ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />} onClick={() => onPick(TOTAL_STEPS)}>
          {t("common.back")}
        </Button>
        <Button size="lg" loading={pending} onClick={finish} icon={<ClipboardCheck className="size-5" aria-hidden />} data-testid="create-baseline">
          {profile.has_baseline ? t("wizard.review.createNew") : t("wizard.review.create")}
        </Button>
      </WizardActions>
    </div>
  );
}

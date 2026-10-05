import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Save } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageSkeleton } from "@/components/ui/Spinner";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import {
  asItems,
  asKeys,
  asSensitivities,
  childUrl,
  patchProfile,
  profileUrl,
  type ChildBasics,
  type EnteredStamp,
  type PerspectiveName,
  type ProfilePatch,
  type ProfileResponse,
  type SectionData,
  type SectionName,
} from "./api";
import { fieldsFor, stepDef, storedName, type FieldDef, type StepDef } from "./definition";
import { ItemsField, KeysField, LevelsGrid, Question, SensitivitiesField, SingleField, TextField } from "./fields";
import { FocusPicker } from "./FocusPicker";
import { WizardActions, WizardProgress } from "./WizardFrame";

export type WizardMode = "staff" | "parent";

type EditKey = `${PerspectiveName}:${SectionName}`;

export function childFirstName(child: ChildBasics | undefined, fallback: string): string {
  if (!child) return fallback;
  return child.preferred_name?.trim() || child.name.split(" ")[0] || fallback;
}

/** Profile + unsaved edits per perspective/section, saved with PATCH on Next. */
export function useWizardProfile(childId: string) {
  const state = useFetch<ProfileResponse>(profileUrl(childId));
  const [edits, setEdits] = useState<Partial<Record<EditKey, SectionData>>>({});
  const { pending, run } = useAction();

  const sectionData = (p: PerspectiveName, s: SectionName): SectionData => {
    const k: EditKey = `${p}:${s}`;
    if (edits[k]) return edits[k]!;
    const persp = p === "parent" ? state.data?.parent_perspective : state.data?.teacher_perspective;
    return persp?.sections?.[s] ?? {};
  };
  const setField = (p: PerspectiveName, s: SectionName, field: string, value: unknown) => {
    setEdits((prev) => {
      const k: EditKey = `${p}:${s}`;
      const base = prev[k] ?? sectionData(p, s);
      return { ...prev, [k]: { ...base, [field]: value } };
    });
  };

  /** Save every edited section (one PATCH each); the last PATCH carries wizard_step/complete. */
  async function persist(extra: Pick<ProfilePatch, "wizard_step" | "complete">): Promise<boolean> {
    const bodies: ProfilePatch[] = (Object.entries(edits) as [EditKey, SectionData][]).map(([k, data]) => {
      const [perspective, section] = k.split(":") as [PerspectiveName, SectionName];
      return { perspective, section, data };
    });
    if (bodies.length === 0) bodies.push({});
    const last = bodies.length - 1;
    bodies[last] = { ...bodies[last], ...extra };
    const r = await run(async () => {
      let latest: ProfileResponse | undefined;
      for (const body of bodies) latest = await patchProfile(childId, body);
      return latest!;
    });
    if (r.ok) {
      state.setData(r.data);
      setEdits({});
    }
    return r.ok;
  }

  return { ...state, sectionData, setField, persist, saving: pending, dirty: Object.keys(edits).length > 0 };
}

export type WizardProfile = ReturnType<typeof useWizardProfile>;

/**
 * One step (2–7) of the wizard for staff or parent. Staff toggle between the
 * parent's and the teacher's answers; parents only see their own questions.
 */
export function WizardStep({
  childId,
  mode,
  step,
  wiz,
  progress,
  onBack,
  onNext,
  onSaveExit,
  nextLabel,
}: {
  childId: string;
  mode: WizardMode;
  step: number;
  wiz: WizardProfile;
  progress: { current: number; total: number; onPick?: (n: number) => void };
  onBack: () => void;
  onNext: () => void;
  onSaveExit: () => void;
  nextLabel?: string;
}) {
  const { t } = useI18n();
  const child = useFetch<{ child: ChildBasics }>(childUrl(childId));
  const [perspective, setPerspective] = useState<PerspectiveName>(mode === "parent" ? "parent" : "teacher");
  const def = stepDef(step);
  const name = childFirstName(child.data?.child, t("wizard.theChild"));

  if (wiz.error && !wiz.data) return <Alert tone="error">{t("wizard.loadError")}</Alert>;
  if (!wiz.data || !def) return <PageSkeleton />;

  const fields = fieldsFor(def, perspective);
  const showFocus = mode === "staff" && perspective === "teacher" && def.focusPicker;
  const parentPriorities = asKeys((wiz.sectionData("parent", "priorities") as { parent_priorities?: unknown }).parent_priorities);
  const merged = [...(wiz.data.strengths ?? []), ...(wiz.data.interests ?? []).map((i) => ({ ...i, list: "interests" }))];
  const Icon = def.icon;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <WizardProgress {...progress} />
      <div className="flex items-start gap-3">
        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-md", def.tile ?? "bg-tray")} aria-hidden>
          <Icon className="size-7" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-display-lg font-semibold text-ink">{t(`wizard.steps.${def.key}.title`, { name })}</h1>
          <p className="mt-1 text-base text-ink-muted">{t(`wizard.steps.${def.key}.intro`, { name })}</p>
        </div>
      </div>

      {mode === "staff" && <PerspectiveToggle value={perspective} onChange={setPerspective} />}
      <EnteredNote stamps={(perspective === "parent" ? wiz.data.parent_perspective : wiz.data.teacher_perspective)?.entered?.[def.section]} perspective={perspective} />

      <Card>
        <CardBody className="space-y-8 py-6">
          {mode === "staff" && perspective === "parent" && <Alert tone="info">{t("wizard.enteringForParent")}</Alert>}
          <StepFields def={def} fields={fields.filter((f) => !f.collapsed)} perspective={perspective} wiz={wiz} name={name} />
          {fields.some((f) => f.collapsed) && (
            <details className="group rounded-md border border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-md px-4 text-sm font-semibold text-brand hover:bg-tray">
                {t("wizard.moreOptional")}
                <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="space-y-8 border-t border-line p-4">
                <StepFields def={def} fields={fields.filter((f) => f.collapsed)} perspective={perspective} wiz={wiz} name={name} />
              </div>
            </details>
          )}
          {showFocus && <FocusPicker childId={childId} parentPriorities={parentPriorities} strengths={merged} />}
          {fields.length === 0 && !showFocus && <p className="text-sm text-ink-muted">{t("wizard.nothingHere")}</p>}
        </CardBody>
      </Card>

      <WizardActions>
        <Button variant="ghost" icon={<ArrowLeft className="rtl:-scale-x-100" aria-hidden />} disabled={wiz.saving} onClick={onBack}>
          {t("common.back")}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Save aria-hidden />} disabled={wiz.saving} onClick={onSaveExit}>
            {t("wizard.saveLater")}
          </Button>
          <Button loading={wiz.saving} onClick={onNext} data-testid="wizard-next">
            {nextLabel ?? t("common.next")}
            <ArrowRight className="rtl:-scale-x-100" aria-hidden />
          </Button>
        </div>
      </WizardActions>
    </div>
  );
}

function PerspectiveToggle({ value, onChange }: { value: PerspectiveName; onChange: (p: PerspectiveName) => void }) {
  const { t } = useI18n();
  return (
    <div className="inline-flex gap-1 rounded-md bg-tray p-1" role="tablist" aria-label={t("wizard.perspective.label")}>
      {(["teacher", "parent"] as const).map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={value === p}
          onClick={() => onChange(p)}
          className={cn(
            "flex min-h-11 items-center gap-1.5 rounded-md px-4 text-sm transition-colors",
            value === p ? "border-2 border-brand bg-surface px-3.5 font-semibold text-ink shadow-lip" : "font-medium text-ink-muted hover:text-ink",
          )}
        >
          {value === p && <Check className="size-4 shrink-0 text-brand" strokeWidth={2.5} aria-hidden />}
          {t(`wizard.perspective.${p}`)}
        </button>
      ))}
    </div>
  );
}

function EnteredNote({ stamps, perspective }: { stamps?: EnteredStamp[]; perspective: PerspectiveName }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const last = stamps?.[stamps.length - 1];
  if (!last) return null;
  const vars = { name: last.by_name ?? "", date: formatDate(last.at) };
  const key = perspective === "parent" && last.role !== "parent" ? "wizard.entered.onBehalf" : "wizard.entered.by";
  return <p className="text-caption text-ink-muted">{t(key, vars)}</p>;
}

function StepFields({ def, fields, perspective, wiz, name }: { def: StepDef; fields: FieldDef[]; perspective: PerspectiveName; wiz: WizardProfile; name: string }) {
  const { t, has } = useI18n();
  const data = wiz.sectionData(perspective, def.section);
  return (
    <>
      {fields.map((f) => {
        const key = storedName(f);
        const set = (v: unknown) => wiz.setField(perspective, def.section, key, v);
        const label = t(`wizard.fields.${f.name}.label`, { name });
        const hintKey = `wizard.fields.${f.name}.hint`;
        const hint = has(hintKey) ? t(hintKey, { name }) : undefined;
        const v = data[key];
        let control;
        switch (f.kind) {
          case "items":
            control = <ItemsField list={f.list} value={asItems(v)} onChange={set} custom={f.custom} tone={f.tone} max={f.max} />;
            break;
          case "keys":
            control = <KeysField list={f.list} value={asKeys(v)} onChange={set} tone={f.tone} />;
            break;
          case "single":
            control = <SingleField list={f.list} value={typeof v === "string" ? v : undefined} onChange={(x) => set(x ?? null)} />;
            break;
          case "text":
            control = <TextField label={label} rows={f.rows} value={typeof v === "string" ? v : ""} onChange={set} />;
            break;
          case "levels":
            control = <LevelsGrid list={f.list} value={(v && typeof v === "object" ? v : {}) as Record<string, string>} onChange={set} />;
            break;
          case "sensitivities":
            control = <SensitivitiesField value={asSensitivities(v)} onChange={set} />;
            break;
        }
        return (
          <Question key={f.name} label={label} hint={hint}>
            {control}
          </Question>
        );
      })}
    </>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Camera, Save } from "lucide-react";
import { AccountIcon } from "@/icons";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { PageSkeleton } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/I18nProvider";
import { fieldErrors } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import {
  childUrl,
  createChild,
  patchProfile,
  updateChild,
  uploadPhoto,
  type ChildBasics,
  type ChildBasicsInput,
  type ClassOption,
} from "./api";
import { KeysField, Question, SingleField } from "./fields";
import { WizardActions, WizardProgress } from "./WizardFrame";
import { TOTAL_STEPS } from "./definition";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

type Form = {
  name: string;
  preferred_name: string;
  birth_date: string;
  gender: string;
  class_id: string;
  main_language: string;
  additional_languages: string[];
  parent_name: string;
  parent_contact: string;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromChild(c: ChildBasics): Form {
  return {
    name: c.name,
    preferred_name: c.preferred_name ?? "",
    birth_date: c.birth_date,
    gender: c.gender ?? "",
    class_id: c.class?.id ?? c.class_id ?? "",
    main_language: c.main_language,
    additional_languages: c.additional_languages ?? [],
    parent_name: c.parent_name ?? "",
    parent_contact: c.parent_contact ?? "",
  };
}

/** Classes the user may place a child in: GET /api/children → classes (WP-05), else GET /api/classes. */
function useClassOptions(): { classes: ClassOption[]; loading: boolean } {
  const fromChildren = useFetch<{ classes?: ClassOption[] }>("/api/children");
  const fallbackNeeded = !!fromChildren.error || (fromChildren.data !== undefined && !fromChildren.data.classes);
  const fromClasses = useFetch<{ classes?: ClassOption[] } | ClassOption[]>(fallbackNeeded ? "/api/classes" : null);
  const classes = useMemo(() => {
    if (fromChildren.data?.classes) return fromChildren.data.classes;
    const d = fromClasses.data;
    if (Array.isArray(d)) return d;
    return d?.classes ?? [];
  }, [fromChildren.data, fromClasses.data]);
  return { classes, loading: fromChildren.loading || fromClasses.loading };
}

/** Step 1 — basic information. `childId` undefined = create a new child. */
export function BasicsStep({ childId }: { childId?: string }) {
  const existing = useFetch<{ child: ChildBasics }>(childId ? childUrl(childId) : null);
  if (childId && !existing.data) {
    return existing.error ? <BasicsLoadError /> : <PageSkeleton />;
  }
  return <BasicsForm key={childId ?? "new"} childId={childId} initial={existing.data?.child} />;
}

function BasicsLoadError() {
  const { t } = useI18n();
  return <Alert tone="error">{t("wizard.loadError")}</Alert>;
}

function BasicsForm({ childId, initial }: { childId?: string; initial?: ChildBasics }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { formatAge } = useFormat();
  const { list, labelOf } = useOptions();
  const { classes, loading: classesLoading } = useClassOptions();
  const { pending, run } = useAction();
  const [form, setForm] = useState<Form>(() =>
    initial
      ? fromChild(initial)
      : { name: "", preferred_name: "", birth_date: "", gender: "", class_id: "", main_language: locale, additional_languages: [], parent_name: "", parent_contact: "" },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // A single class is picked automatically.
  const onlyClass = classes.length === 1 ? classes[0]!.id : "";
  const classId = form.class_id || onlyClass;

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const age = form.birth_date && form.birth_date <= todayIso() ? formatAge(form.birth_date) : null;

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t("wizard.basics.required");
    if (!form.birth_date) e.birth_date = t("wizard.basics.required");
    else if (form.birth_date > todayIso()) e.birth_date = t("wizard.basics.futureDate");
    if (!classId && classes.length > 0) e.class_id = t("wizard.basics.required");
    if (!form.main_language) e.main_language = t("wizard.basics.required");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(exit: boolean) {
    if (!validate()) return;
    const body: ChildBasicsInput = {
      name: form.name.trim(),
      preferred_name: form.preferred_name.trim() || null,
      birth_date: form.birth_date,
      gender: form.gender || null,
      class_id: classId || null,
      main_language: form.main_language,
      additional_languages: form.additional_languages.filter((l) => l !== form.main_language),
      parent_name: form.parent_name.trim() || null,
      parent_contact: form.parent_contact.trim() || null,
    };
    const r = await run(() => (childId ? updateChild(childId, body) : createChild(body)), {
      errorToast: true,
      onError: (e) => setErrors(fieldErrors(e)),
    });
    if (!r.ok) return;
    const id = r.data.child.id;
    if (photo) {
      try {
        await uploadPhoto(id, photo);
      } catch {
        toast(t("wizard.basics.photoFailed"), "error");
      }
    }
    if (!childId) {
      try {
        await patchProfile(id, { wizard_step: 2 });
      } catch {
        /* the step is only a resume hint */
      }
    }
    toast(t("wizard.saved"));
    navigate(exit ? paths.child(id) : paths.childEdit(id, 2), { replace: !childId });
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(false);
  };

  const languages = list("languages");

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl space-y-5">
      <WizardProgress
        current={1}
        total={TOTAL_STEPS}
        onPick={childId ? (n) => n > 1 && navigate(paths.childEdit(childId, n)) : undefined}
      />
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-tray" aria-hidden>
          <AccountIcon className="size-7" />
        </span>
        <div>
          <h1 className="font-display text-display-lg font-semibold text-ink">{childId ? t("wizard.basics.editTitle") : t("wizard.basics.title")}</h1>
          <p className="mt-1 text-base text-ink-muted">{t("wizard.basics.intro")}</p>
        </div>
      </div>

      <Card>
        <CardBody className="space-y-5 py-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("wizard.basics.name")} error={errors.name} required>
              {(p) => <Input {...p} dir="auto" autoComplete="off" maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} />}
            </Field>
            <Field label={t("wizard.basics.preferredName")} hint={t("wizard.basics.preferredNameHint")} error={errors.preferred_name}>
              {(p) => <Input {...p} dir="auto" maxLength={60} value={form.preferred_name} onChange={(e) => set("preferred_name", e.target.value)} />}
            </Field>
            <Field label={t("wizard.basics.birthDate")} error={errors.birth_date} required>
              {(p) => <Input {...p} type="date" dir="ltr" max={todayIso()} value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} />}
            </Field>
            <Field
              label={t("wizard.basics.class")}
              error={errors.class_id}
              hint={!classesLoading && classes.length === 0 ? t("wizard.basics.noClasses") : undefined}
              required={classes.length > 0}
            >
              {(p) => (
                <Select {...p} value={classId} disabled={classes.length === 0} onChange={(e) => set("class_id", e.target.value)}>
                  <option value="">{classes.length === 0 ? "" : t("wizard.choose")}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.kindergarten ? `${c.name} · ${c.kindergarten}` : c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          {age && (
            <p className="tabular rounded-md bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand" aria-live="polite">
              {t("wizard.basics.age", { age })}
            </p>
          )}

          <Question label={t("wizard.basics.gender")} hint={t("wizard.basics.genderHint")}>
            <SingleField list="genders" value={form.gender || undefined} onChange={(v) => set("gender", v ?? "")} />
          </Question>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("wizard.basics.mainLanguage")} error={errors.main_language} required>
              {(p) => (
                <Select {...p} value={form.main_language} onChange={(e) => set("main_language", e.target.value)}>
                  <option value="">{t("wizard.choose")}</option>
                  {languages.map((l) => (
                    <option key={l.key} value={l.key}>
                      {labelOf(l)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Question label={t("wizard.basics.additionalLanguages")}>
            <KeysField
              list="languages"
              value={form.additional_languages.filter((l) => l !== form.main_language)}
              onChange={(v) => set("additional_languages", v.filter((l) => l !== form.main_language))}
            />
          </Question>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("wizard.basics.parentName")} error={errors.parent_name}>
              {(p) => <Input {...p} dir="auto" maxLength={120} value={form.parent_name} onChange={(e) => set("parent_name", e.target.value)} />}
            </Field>
            <Field label={t("wizard.basics.parentContact")} hint={t("wizard.basics.parentContactHint")} error={errors.parent_contact}>
              {(p) => <Input {...p} dir="ltr" maxLength={200} value={form.parent_contact} onChange={(e) => set("parent_contact", e.target.value)} />}
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {preview && <img src={preview} alt="" className="size-16 rounded-md border border-line object-cover" />}
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-[1.5px] border-line-strong bg-surface px-4 text-sm font-semibold text-ink shadow-lip transition-colors hover:bg-tray focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring">
              <Camera className="size-5" aria-hidden />
              {photo ? t("wizard.basics.changePhoto") : initial?.has_photo ? t("wizard.basics.replacePhoto") : t("wizard.basics.addPhoto")}
              <input
                type="file"
                accept={PHOTO_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && (!PHOTO_TYPES.includes(f.type) || f.size > PHOTO_MAX_BYTES)) {
                    toast(t("wizard.basics.photoInvalid"), "error");
                    return;
                  }
                  setPhoto(f);
                }}
              />
            </label>
            <span className="text-caption text-ink-muted">{t("common.optional")}</span>
          </div>
        </CardBody>
      </Card>

      <WizardActions>
        <Button variant="ghost" disabled={pending} onClick={() => navigate(childId ? paths.child(childId) : paths.children())}>
          {t("common.cancel")}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Save aria-hidden />} disabled={pending} onClick={() => void submit(true)}>
            {t("wizard.saveLater")}
          </Button>
          <Button type="submit" loading={pending} data-testid="wizard-next">
            {t("common.next")}
            <ArrowRight className="rtl:-scale-x-100" aria-hidden />
          </Button>
        </div>
      </WizardActions>
    </form>
  );
}

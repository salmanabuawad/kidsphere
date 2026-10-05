import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Archive } from "lucide-react";
import { Alert, Button, Dialog, Field, Input, Select, ToggleChip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { api, fieldErrors } from "@/lib/api";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { childUrl, displayName } from "./api";
import type { ChildBasics, ChildBasicsInput, ChildListResponse } from "./types";

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

function toForm(c: ChildBasics): Form {
  return {
    name: c.name,
    preferred_name: c.preferred_name ?? "",
    birth_date: c.birth_date,
    gender: c.gender ?? "",
    class_id: c.class?.id ?? "",
    main_language: c.main_language,
    additional_languages: [...c.additional_languages],
    parent_name: c.parent_name ?? "",
    parent_contact: c.parent_contact ?? "",
  };
}

/** Only the fields that changed; empty optional text becomes null. */
function diff(before: Form, after: Form): ChildBasicsInput {
  const out: ChildBasicsInput = {};
  const text = (k: "preferred_name" | "gender" | "parent_name" | "parent_contact") => {
    if (before[k].trim() !== after[k].trim()) out[k] = after[k].trim() || null;
  };
  if (before.name.trim() !== after.name.trim()) out.name = after.name.trim();
  if (before.birth_date !== after.birth_date) out.birth_date = after.birth_date;
  if (before.class_id !== after.class_id && after.class_id) out.class_id = after.class_id;
  if (before.main_language !== after.main_language) out.main_language = after.main_language;
  if (before.additional_languages.join() !== after.additional_languages.join()) out.additional_languages = after.additional_languages;
  text("preferred_name");
  text("gender");
  text("parent_name");
  text("parent_contact");
  return out;
}

/** Staff dialog for the child's basics (spec §5), plus "Archive child". */
export function EditBasicsDialog({
  child,
  open,
  onClose,
  onSaved,
}: {
  child: ChildBasics;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={t("children.edit.title")} size="lg">
      {open && <EditForm child={child} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function EditForm({ child, onClose, onSaved }: { child: ChildBasics; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const { list, labelOf } = useOptions();
  const navigate = useNavigate();
  const initial = toForm(child);
  const [form, setForm] = useState<Form>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmArchive, setConfirmArchive] = useState(false);
  const save = useAction();
  const archive = useAction();
  const { data: listing } = useFetch<ChildListResponse>("/api/children");
  const classes = listing?.classes ?? (child.class ? [child.class] : []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleLanguage = (key: string) =>
    set("additional_languages", form.additional_languages.includes(key) ? form.additional_languages.filter((l) => l !== key) : [...form.additional_languages, key]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = diff(initial, form);
    if (Object.keys(body).length === 0) return onClose();
    setErrors({});
    await save.run(() => api(childUrl(child.id), { method: "PUT", body }), {
      success: t("children.edit.saved"),
      onSuccess: () => {
        onSaved();
        onClose();
      },
      onError: (err) => setErrors(fieldErrors(err)),
    });
  }

  const languages = list("languages");
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("children.edit.name")} required error={errors.name}>
          {(p) => <Input {...p} dir="auto" value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />}
        </Field>
        <Field label={t("children.edit.preferredName")} hint={t("children.edit.preferredNameHint")} error={errors.preferred_name}>
          {(p) => <Input {...p} dir="auto" value={form.preferred_name} maxLength={60} onChange={(e) => set("preferred_name", e.target.value)} />}
        </Field>
        <Field label={t("children.edit.birthDate")} required error={errors.birth_date}>
          {(p) => (
            <Input {...p} type="date" dir="ltr" value={form.birth_date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("birth_date", e.target.value)} />
          )}
        </Field>
        <Field label={t("children.edit.gender")} error={errors.gender}>
          {(p) => (
            <Select {...p} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">{t("children.edit.genderNone")}</option>
              {list("genders")
                .filter((g) => g.key !== "unspecified")
                .map((g) => (
                  <option key={g.key} value={g.key}>
                    {labelOf(g)}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label={t("children.edit.class")} required error={errors.class_id}>
          {(p) => (
            <Select {...p} value={form.class_id} onChange={(e) => set("class_id", e.target.value)}>
              {!form.class_id && <option value="">{t("children.child.noClass")}</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kindergarten ? `${c.name} · ${c.kindergarten}` : c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("children.edit.mainLanguage")} required error={errors.main_language}>
          {(p) => (
            <Select {...p} value={form.main_language} onChange={(e) => set("main_language", e.target.value)}>
              {languages.map((l) => (
                <option key={l.key} value={l.key}>
                  {labelOf(l)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">{t("children.edit.additionalLanguages")}</legend>
        <div className="flex flex-wrap gap-2">
          {languages
            .filter((l) => l.key !== form.main_language)
            .map((l) => (
              <ToggleChip key={l.key} selected={form.additional_languages.includes(l.key)} onToggle={() => toggleLanguage(l.key)}>
                {labelOf(l)}
              </ToggleChip>
            ))}
        </div>
        {errors.additional_languages && <p className="text-caption mt-1 font-medium text-danger">{errors.additional_languages}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("children.edit.parentName")} error={errors.parent_name}>
          {(p) => <Input {...p} dir="auto" value={form.parent_name} maxLength={120} onChange={(e) => set("parent_name", e.target.value)} />}
        </Field>
        <Field label={t("children.edit.parentContact")} error={errors.parent_contact}>
          {(p) => <Input {...p} dir="auto" value={form.parent_contact} maxLength={200} onChange={(e) => set("parent_contact", e.target.value)} />}
        </Field>
      </div>

      {confirmArchive ? (
        <Alert
          tone="warning"
          title={t("children.edit.archive")}
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={archive.pending}
                onClick={() =>
                  archive.run(() => api(`${childUrl(child.id)}/archive`, { method: "POST" }), {
                    success: t("children.edit.archived"),
                    onSuccess: () => navigate(paths.children()),
                  })
                }
              >
                {t("children.edit.archiveConfirmAction")}
              </Button>
            </div>
          }
        >
          {t("children.edit.archiveConfirm", { name: displayName(child) })}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {!child.archived && !confirmArchive && (
          <Button variant="ghost" className="me-auto" icon={<Archive className="size-4" aria-hidden />} onClick={() => setConfirmArchive(true)}>
            {t("children.edit.archive")}
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" loading={save.pending}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

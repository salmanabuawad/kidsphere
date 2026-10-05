import { useEffect, useId, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { useI18n } from "@/i18n/I18nProvider";
import { api, fieldErrors, isApiError } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import type { AdminUser, ClassRow } from "./types";

/** Create (POST /api/classes) or rename (PUT /api/classes/{id}) a class. */
export function ClassDialog({
  open,
  klass,
  kindergartens,
  onClose,
  onSaved,
}: {
  open: boolean;
  klass?: ClassRow | null;
  kindergartens: string[];
  onClose: () => void;
  onSaved: (row: ClassRow) => void;
}) {
  const { t } = useI18n();
  const listId = useId();
  const { pending, run, errorMessage } = useAction();
  const [name, setName] = useState("");
  const [kindergarten, setKindergarten] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(klass?.name ?? "");
    setKindergarten(klass?.kindergarten ?? (kindergartens.length === 1 ? kindergartens[0]! : ""));
    setErrors({});
    setFormError(null);
    // Reset when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, klass?.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t("admin.classes.nameRequired");
    if (!kindergarten.trim()) errs.kindergarten = t("admin.classes.kindergartenRequired");
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    const body = { name: name.trim(), kindergarten: kindergarten.trim() };
    await run(
      () =>
        klass
          ? api<{ class: ClassRow }>(`/api/classes/${encodeURIComponent(klass.id)}`, { method: "PUT", body })
          : api<{ class: ClassRow }>("/api/classes", { body }),
      {
        success: klass ? t("admin.classes.saved") : t("admin.classes.created"),
        errorToast: false,
        onSuccess: (res) => onSaved(res.class),
        onError: (err) => {
          if (isApiError(err, "DUPLICATE")) setErrors({ name: t("admin.classes.duplicate") });
          else {
            const fe = fieldErrors(err);
            if (fe.name || fe.kindergarten)
              setErrors({
                ...(fe.name ? { name: t("admin.classes.nameRequired") } : {}),
                ...(fe.kindergarten ? { kindergarten: t("admin.classes.kindergartenRequired") } : {}),
              });
            else setFormError(errorMessage(err));
          }
        },
      },
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={klass ? t("admin.classes.editTitle") : t("admin.classes.createTitle")}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label={t("admin.classes.name")} error={errors.name} required>
          {(p) => <Input {...p} dir="auto" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t("admin.classes.kindergarten")} hint={t("admin.classes.kindergartenHint")} error={errors.kindergarten} required>
          {(p) => <Input {...p} dir="auto" maxLength={120} list={listId} value={kindergarten} onChange={(e) => setKindergarten(e.target.value)} />}
        </Field>
        <datalist id={listId}>
          {kindergartens.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={pending}>
            {klass ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** PUT /api/classes/{id}/teachers {user_ids}: choose the class's teachers from active teacher accounts. */
export function TeachersDialog({ klass, onClose, onSaved }: { klass: ClassRow | null; onClose: () => void; onSaved: (row: ClassRow) => void }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const { data, loading } = useFetch<{ users: AdminUser[] }>(klass ? "/api/users" : null, { role: "teacher" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set(klass?.teachers.map((x) => x.id) ?? []));
  }, [klass]);

  const assigned = new Set(klass?.teachers.map((x) => x.id) ?? []);
  // Inactive teachers stay listed only while they are still assigned, so they can be removed.
  const teachers = (data?.users ?? []).filter((u) => u.role === "teacher" && (u.is_active || assigned.has(u.id)));

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save() {
    if (!klass) return;
    await run(() => api<{ class: ClassRow }>(`/api/classes/${encodeURIComponent(klass.id)}/teachers`, { method: "PUT", body: { user_ids: [...selected] } }), {
      success: t("admin.classes.teachersSaved"),
      onSuccess: (res) => onSaved(res.class),
    });
  }

  return (
    <Dialog
      open={!!klass}
      onClose={onClose}
      title={t("admin.classes.teachersTitle", { name: klass?.name ?? "" })}
      description={t("admin.classes.teachersHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={pending} onClick={save} disabled={loading}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      {loading && !data ? (
        <Spinner label={t("common.loading")} />
      ) : teachers.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("admin.classes.noTeachers")}</p>
      ) : (
        <fieldset>
          <legend className="sr-only">{t("admin.classes.teachers")}</legend>
          <ul className="divide-y divide-line">
            {teachers.map((u) => (
              <li key={u.id}>
                <Checkbox
                  checked={selected.has(u.id)}
                  onChange={(e) => toggle(u.id, e.target.checked)}
                  label={
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span dir="auto" className="font-medium">
                        {u.name}
                      </span>
                      <span dir="ltr" className="text-caption text-ink-muted">
                        <bdi>{u.email}</bdi>
                      </span>
                      {!u.is_active && <span className="text-caption text-ink-muted">({t("admin.users.inactive")})</span>}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </Dialog>
  );
}

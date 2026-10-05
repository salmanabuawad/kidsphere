import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { LOCALE_NAMES } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { api, fieldErrors, isApiError } from "@/lib/api";
import type { Role } from "@/lib/paths";
import { useAction } from "@/lib/useAction";
import { LANGUAGES, MIN_PASSWORD, ROLES, type AdminUser, type Language } from "./types";

type Values = { name: string; email: string; role: Role; language: Language; password: string };

/**
 * Create (POST /api/users) or edit (PUT /api/users/{id}) a user.
 * `lockRole` keeps the role fixed (e.g. "Create parent account" on the parent-links page);
 * `isSelf` blocks changing your own role (the server rejects it too).
 */
export function UserDialog({
  open,
  user,
  defaultRole = "teacher",
  lockRole,
  isSelf,
  onClose,
  onSaved,
}: {
  open: boolean;
  user?: AdminUser | null;
  defaultRole?: Role;
  lockRole?: boolean;
  isSelf?: boolean;
  onClose: () => void;
  onSaved: (user: AdminUser) => void;
}) {
  const { t, locale } = useI18n();
  const { pending, run, errorMessage } = useAction();
  const editing = !!user;
  const initial = (): Values => ({
    name: user?.name ?? "",
    email: user?.email ?? "",
    role: user?.role ?? defaultRole,
    language: user?.language ?? (locale as Language),
    password: "",
  });
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(initial());
      setErrors({});
      setFormError(null);
    }
    // Reset whenever the dialog opens for another user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((prev) => ({ ...prev, [k]: v }));

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!values.name.trim()) e.name = t("admin.users.nameRequired");
    if (!editing) {
      if (!/^[a-z0-9._%+@-]{2,200}$/.test(values.email.trim().toLowerCase())) e.email = t("admin.users.identifierInvalid");
      if (values.password.length < MIN_PASSWORD) e.password = t("admin.users.passwordRule", { n: MIN_PASSWORD });
    }
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    const body = editing
      ? { name: values.name.trim(), language: values.language, ...(isSelf ? {} : { role: values.role }) }
      : { name: values.name.trim(), email: values.email.trim().toLowerCase(), role: values.role, language: values.language, password: values.password };
    await run(
      () =>
        editing
          ? api<{ user: AdminUser }>(`/api/users/${encodeURIComponent(user!.id)}`, { method: "PUT", body })
          : api<{ user: AdminUser }>("/api/users", { body }),
      {
        success: editing ? t("admin.users.saved") : t("admin.users.created"),
        errorToast: false,
        onSuccess: (res) => onSaved(res.user),
        onError: (err) => {
          if (isApiError(err, "DUPLICATE")) setErrors({ email: t("admin.users.identifierTaken") });
          else if (isApiError(err, "FORBIDDEN") && isSelf) setFormError(t("admin.users.selfBlocked"));
          else {
            const fe = fieldErrors(err);
            const mapped: Record<string, string> = {};
            if (fe.name) mapped.name = t("admin.users.nameRequired");
            if (fe.email) mapped.email = t("admin.users.identifierInvalid");
            if (fe.password) mapped.password = t("admin.users.passwordRule", { n: MIN_PASSWORD });
            setErrors(mapped);
            if (!Object.keys(mapped).length) setFormError(errorMessage(err));
          }
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("admin.users.editTitle") : lockRole && defaultRole === "parent" ? t("admin.parents.createParent") : t("admin.users.createTitle")}
      description={editing ? undefined : t("admin.users.createHint")}
    >
      <form id="user-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label={t("common.name")} error={errors.name} required>
          {(p) => <Input {...p} dir="auto" autoComplete="off" maxLength={120} value={values.name} onChange={(e) => set("name", e.target.value)} />}
        </Field>
        <Field label={t("admin.users.identifier")} hint={editing ? t("admin.users.identifierFixed") : t("admin.users.identifierHint")} error={errors.email} required={!editing}>
          {(p) => (
            <Input
              {...p}
              dir="ltr"
              type="text"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={200}
              value={values.email}
              disabled={editing}
              onChange={(e) => set("email", e.target.value)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("common.role")} hint={isSelf ? t("admin.users.selfRoleHint") : editing && values.role !== user!.role ? t("admin.users.roleChangeHint") : undefined}>
            {(p) => (
              <Select {...p} value={values.role} disabled={lockRole || isSelf} onChange={(e) => set("role", e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`common.roles.${r}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("common.language")}>
            {(p) => (
              <Select {...p} value={values.language} onChange={(e) => set("language", e.target.value as Language)}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {!editing && (
          <Field label={t("admin.users.password")} hint={t("admin.users.passwordRule", { n: MIN_PASSWORD })} error={errors.password} required>
            {(p) => (
              <Input {...p} type="password" dir="ltr" autoComplete="new-password" value={values.password} onChange={(e) => set("password", e.target.value)} />
            )}
          </Field>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={pending}>
            {editing ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

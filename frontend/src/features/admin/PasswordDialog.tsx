import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { MIN_PASSWORD, type AdminUser } from "./types";

/** POST /api/users/{id}/password: sets a new password and signs the user out everywhere. */
export function PasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setPassword("");
    setConfirm("");
    setTouched(false);
  }, [user?.id]);

  const tooShort = password.length < MIN_PASSWORD;
  const mismatch = confirm !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!user || tooShort || mismatch) return;
    const r = await run(() => api(`/api/users/${encodeURIComponent(user.id)}/password`, { body: { password } }), {
      success: t("admin.users.passwordSet", { name: user.name }),
    });
    if (r.ok) onClose();
  }

  return (
    <Dialog open={!!user} onClose={onClose} title={t("admin.users.resetPassword")} description={user ? user.name : undefined} size="sm">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Alert tone="info">{t("admin.users.resetPasswordHint")}</Alert>
        <Field
          label={t("admin.users.newPassword")}
          hint={t("admin.users.passwordRule", { n: MIN_PASSWORD })}
          error={touched && tooShort ? t("admin.users.passwordRule", { n: MIN_PASSWORD }) : undefined}
          required
        >
          {(p) => <Input {...p} type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label={t("admin.users.confirmPassword")} error={touched && mismatch ? t("admin.users.passwordMismatch") : undefined} required>
          {(p) => <Input {...p} type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={pending}>
            {t("admin.users.setPassword")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

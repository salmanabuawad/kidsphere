import { useState, type FormEvent } from "react";
import { KeyRound, Languages } from "lucide-react";
import { AccountIcon } from "@/icons";
import { useAuth, useUser, type User } from "@/auth/AuthProvider";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/i18n/I18nProvider";
import { api, fieldErrors, isApiError } from "@/lib/api";
import { useAction } from "@/lib/useAction";

export const MIN_PASSWORD_LENGTH = 10;

function ProfileCard() {
  const { t } = useI18n();
  const user = useUser();
  const { setUser } = useAuth();
  const { pending, run } = useAction();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | undefined>();
  const trimmed = name.trim();

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!trimmed) {
      setError(t("account.nameRequired"));
      return;
    }
    setError(undefined);
    await run(() => api<{ user: User }>("/api/me", { method: "PUT", body: { name: trimmed } }), {
      success: t("account.saved"),
      onSuccess: (res) => setUser(res.user),
      onError: (err) => setError(fieldErrors(err).name),
    });
  }

  return (
    <Card>
      <CardHeader icon={<AccountIcon />} title={t("account.profile")} />
      <CardBody>
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={user.name} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink" dir="auto">
              {user.name}
            </p>
            <p className="truncate text-sm text-ink-muted" dir="ltr">
              {user.email}
            </p>
            <Badge tone="brand" className="mt-1.5">
              {t(`common.roles.${user.role}`)}
            </Badge>
          </div>
        </div>
        <form onSubmit={save} className="space-y-4" noValidate>
          <Field label={t("common.name")} error={error} required>
            {(p) => <Input {...p} dir="auto" autoComplete="name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Button type="submit" loading={pending} disabled={!trimmed || trimmed === user.name}>
            {t("common.save")}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function LanguageCard() {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader icon={<Languages className="text-ink-muted" />} title={t("common.uiLanguage")} description={t("account.languageHint")} />
      <CardBody>
        <LocaleSwitcher variant="segmented" />
      </CardBody>
    </Card>
  );
}

function PasswordCard() {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const { pending, run, errorMessage } = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentError, setCurrentError] = useState<string | undefined>();

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = current.length > 0 && next.length >= MIN_PASSWORD_LENGTH && confirm === next;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setCurrentError(undefined);
    const r = await run(() => api("/api/me/password", { body: { current_password: current, new_password: next } }), {
      success: t("auth.passwordChanged"),
      errorToast: false,
      onError: (err) =>
        setCurrentError(
          isApiError(err, "INVALID_CREDENTIALS") || isApiError(err, "VALIDATION") ? t("account.currentPasswordWrong") : errorMessage(err),
        ),
    });
    if (r.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      // The server may end sessions on password change; re-check ours.
      void refresh();
    }
  }

  return (
    <Card>
      <CardHeader icon={<KeyRound className="text-ink-muted" />} title={t("auth.changePassword")} />
      <CardBody>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label={t("auth.currentPassword")} error={currentError} required>
            {(p) => <Input {...p} type="password" dir="ltr" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
          <Field
            label={t("auth.newPassword")}
            hint={t("auth.passwordRule", { n: MIN_PASSWORD_LENGTH })}
            error={tooShort ? t("auth.passwordRule", { n: MIN_PASSWORD_LENGTH }) : undefined}
            required
          >
            {(p) => <Input {...p} type="password" dir="ltr" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
          </Field>
          <Field label={t("auth.confirmPassword")} error={mismatch ? t("auth.passwordMismatch") : undefined} required>
            {(p) => <Input {...p} type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
          </Field>
          <Button type="submit" variant="outline" loading={pending} disabled={!canSubmit}>
            {t("auth.changePassword")}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function AccountPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader icon={<AccountIcon />} title={t("account.title")} description={t("account.subtitle")} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <ProfileCard />
          <LanguageCard />
        </div>
        <PasswordCard />
      </div>
    </div>
  );
}

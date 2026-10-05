import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Eye, EyeOff, LogIn, Sprout } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useI18n } from "@/i18n/I18nProvider";
import { homeFor, safeNext } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";

export function LoginPage() {
  const { t } = useI18n();
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const toMessage = useErrorMessage();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === "loading") return <FullPageSpinner />;
  if (user && !pending) return <Navigate to={next ?? homeFor(user.role)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError(t("auth.missingFields"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const u = await login(identifier, password);
      navigate(next ?? homeFor(u.role), { replace: true });
    } catch (err) {
      setError(toMessage(err));
      setPending(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-surface">
      <div aria-hidden className="pointer-events-none absolute -start-24 -top-24 size-80 rounded-full bg-brand/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -end-20 top-1/3 size-72 rounded-full bg-amber-200/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 start-1/4 size-72 rounded-full bg-violet-200/25 blur-3xl" />

      <div className="relative flex justify-end p-3">
        <LocaleSwitcher variant="compact" />
      </div>

      <main className="relative flex flex-1 items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand text-white shadow-[var(--shadow-raised)]" aria-hidden>
              <Sprout className="size-7" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("auth.welcome")}</h1>
            <p className="mt-1.5 text-sm text-muted">{t("auth.welcomeSub")}</p>
          </div>

          <div className="animate-rise rounded-3xl border border-line bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              {error && <Alert tone="error">{error}</Alert>}
              <Field label={t("auth.identifier")} required>
                {(p) => (
                  <Input
                    {...p}
                    name="identifier"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    dir="ltr"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("auth.password")} required>
                {(p) => (
                  <div className="relative" dir="ltr">
                    <Input
                      {...p}
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      dir="ltr"
                      className="pe-12"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 end-0 inline-flex w-11 items-center justify-center rounded-e-xl text-muted hover:text-ink"
                    >
                      {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  </div>
                )}
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={pending} icon={<LogIn className="size-4 rtl:rotate-180" aria-hidden />}>
                {pending ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
            </form>
            <p className="mt-5 text-center text-xs text-muted">{t("auth.forgotHint")}</p>
          </div>

          <ul className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-stone-600" aria-label={t("common.tagline")}>
            <li className="rounded-full bg-emerald-50 px-3 py-1 ring-1 ring-emerald-200 ring-inset">⭐ {t("auth.pillarStrengths")}</li>
            <li className="rounded-full bg-sky-50 px-3 py-1 ring-1 ring-sky-200 ring-inset">💙 {t("auth.pillarInterests")}</li>
            <li className="rounded-full bg-violet-50 px-3 py-1 ring-1 ring-violet-200 ring-inset">🌱 {t("auth.pillarGrowth")}</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

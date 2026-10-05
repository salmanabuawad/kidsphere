import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";
import { BlockCluster } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { BrandMarkIcon, GrowthSupportIcon, InterestsIcon, StrengthsIcon } from "@/icons";
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
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-ground">
      <div className="relative flex justify-end p-3">
        <LocaleSwitcher variant="compact" />
      </div>

      <main className="relative flex flex-1 items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <BrandMarkIcon className="mb-3 size-16" aria-hidden />
            <h1 className="font-display text-display-lg font-semibold text-ink">{t("auth.welcome")}</h1>
            <p className="mt-1.5 text-sm text-ink-muted">{t("auth.welcomeSub")}</p>
          </div>

          <div className="animate-placed rounded-lg border border-line bg-surface p-6 shadow-lip sm:p-8">
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
                      className="absolute inset-y-0 end-0 inline-flex w-12 items-center justify-center rounded-e-md text-ink-muted hover:text-ink"
                    >
                      {showPassword ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
                    </button>
                  </div>
                )}
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={pending} icon={<LogIn className="rtl:-scale-x-100" aria-hidden />}>
                {pending ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
            </form>
            <p className="text-caption mt-5 text-center text-ink-muted">{t("auth.forgotHint")}</p>
          </div>

          <ul className="mt-6 flex flex-wrap justify-center gap-2" aria-label={t("common.tagline")}>
            <li>
              <Chip tone="strength" icon={<StrengthsIcon size={16} />}>
                {t("auth.pillarStrengths")}
              </Chip>
            </li>
            <li>
              <Chip tone="interest" icon={<InterestsIcon size={16} />}>
                {t("auth.pillarInterests")}
              </Chip>
            </li>
            <li>
              <Chip tone="focus" icon={<GrowthSupportIcon size={16} />}>
                {t("auth.pillarGrowth")}
              </Chip>
            </li>
          </ul>
          <BlockCluster className="mx-auto mt-6" />
        </div>
      </main>
    </div>
  );
}

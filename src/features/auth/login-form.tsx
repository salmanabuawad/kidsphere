"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { api, useErrorMessage } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

export function LoginForm({ next }: { next: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await api<{ redirectTo: string }>("/api/auth/login", { body: { email, password } });
      router.push(next ?? res.redirectTo);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t("common.email")} required>
        {(p) => <Input {...p} type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required name="email" />}
      </Field>
      <Field label={t("auth.password")} required>
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            name="password"
          />
        )}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {pending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
      <div className="text-center">
        <Link href="/forgot-password" className="text-brand text-sm hover:underline">
          {t("auth.forgot")}
        </Link>
      </div>
    </form>
  );
}

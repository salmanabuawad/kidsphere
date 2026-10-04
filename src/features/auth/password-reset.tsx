"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { api, useErrorMessage } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

export function PasswordResetForms({ mode, token }: { mode: "request" | "reset"; token?: string }) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [value, setValue] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (mode === "request") await api("/api/auth/forgot", { body: { email: value } });
      else await api("/api/auth/reset", { body: { token, password: value } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (done)
    return (
      <Alert tone="success" className="mt-5">
        {mode === "request" ? t("auth.linkSent") : t("auth.resetDone")}
      </Alert>
    );

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {mode === "request" ? (
        <Field label={t("common.email")} required>
          {(p) => <Input {...p} type="email" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} required />}
        </Field>
      ) : (
        <Field label={t("auth.newPassword")} hint={t("auth.passwordRule")} required>
          {(p) => (
            <Input
              {...p}
              type="password"
              dir="ltr"
              minLength={10}
              autoComplete="new-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          )}
        </Field>
      )}
      <Button type="submit" className="w-full" loading={pending}>
        {mode === "request" ? t("auth.sendLink") : t("common.save")}
      </Button>
    </form>
  );
}

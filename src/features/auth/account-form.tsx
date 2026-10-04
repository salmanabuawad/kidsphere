"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

export function AccountForm({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [n, setN] = useState(name);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title={t("account.profile")} description={`${email} · ${roleLabel}`} />
        <CardBody className="space-y-4">
          <Field label={t("common.name")}>{(p) => <Input {...p} value={n} onChange={(e) => setN(e.target.value)} />}</Field>
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("common.uiLanguage")}</p>
            <LocaleSwitcher className="border-line w-full border bg-white" />
          </div>
          <Button loading={pending} onClick={() => run(() => api("/api/me", { method: "PATCH", body: { name: n } }), { success: t("account.saved") })}>
            {t("common.save")}
          </Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t("auth.changePassword")} />
        <CardBody className="space-y-4">
          <Field label={t("auth.currentPassword")}>
            {(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
          <Field label={t("auth.newPassword")} hint={t("auth.passwordRule")}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
          </Field>
          <Button
            disabled={!current || next.length < 10}
            loading={pending}
            onClick={async () => {
              const ok = await run(() => api("/api/me/password", { body: { currentPassword: current, newPassword: next } }), {
                success: t("auth.passwordChanged"),
              });
              if (ok) {
                setCurrent("");
                setNext("");
              }
            }}
          >
            {t("auth.changePassword")}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

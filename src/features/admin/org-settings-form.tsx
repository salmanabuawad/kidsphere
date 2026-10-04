"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NAMES, RTL_LOCALES, type AppLocale } from "@/lib/i18n/config";

type Org = {
  id: string;
  name: string;
  brandColor: string;
  defaultLocale: AppLocale;
  enabledLocales: AppLocale[];
  aiProvider: string | null;
  aiEnabled: boolean;
  mediaEnabled: boolean;
};

export function LocalizationForm({ org }: { org: Org }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [enabled, setEnabled] = useState<AppLocale[]>(org.enabledLocales);
  const [def, setDef] = useState<AppLocale>(org.defaultLocale);
  return (
    <Card>
      <CardBody className="space-y-4">
        {LOCALES.map((l) => (
          <div key={l} className="border-line flex items-center gap-3 border-b py-2 last:border-0">
            <Checkbox
              label={LOCALE_NAMES[l]}
              checked={enabled.includes(l)}
              onChange={(e) => setEnabled(e.target.checked ? [...enabled, l] : enabled.filter((x) => x !== l))}
            />
            <Badge tone="stone">{RTL_LOCALES.has(l) ? t("admin.localization.rtl") : t("admin.localization.ltr")}</Badge>
            <label className="ms-auto flex items-center gap-2 text-sm">
              <input type="radio" name="default" checked={def === l} onChange={() => setDef(l)} disabled={!enabled.includes(l)} />
              {t("admin.localization.default")}
            </label>
          </div>
        ))}
        <Button
          loading={pending}
          disabled={enabled.length === 0 || !enabled.includes(def)}
          onClick={() =>
            run(() => api(`/api/admin/organizations/${org.id}`, { method: "PATCH", body: { enabledLocales: enabled, defaultLocale: def } }), {
              success: t("admin.localization.saved"),
            })
          }
        >
          {t("common.save")}
        </Button>
      </CardBody>
    </Card>
  );
}

export function SettingsForm({ org }: { org: Org }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [name, setName] = useState(org.name);
  const [color, setColor] = useState(org.brandColor);
  const [mediaEnabled, setMediaEnabled] = useState(org.mediaEnabled);
  const [aiEnabled, setAiEnabled] = useState(org.aiEnabled);
  const [aiProvider, setAiProvider] = useState(org.aiProvider ?? "");
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title={t("admin.settings.branding")} />
        <CardBody className="space-y-4">
          <Field label={t("admin.settings.orgName")}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={t("admin.settings.brandColor")}>
            {(p) => (
              <div className="flex items-center gap-3">
                <input
                  {...p}
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="border-line h-10 w-16 cursor-pointer rounded-lg border"
                />
                <span className="font-mono text-sm" dir="ltr">
                  {color}
                </span>
              </div>
            )}
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t("admin.settings.consent")} />
        <CardBody>
          <Checkbox label={t("admin.settings.mediaEnabled")} checked={mediaEnabled} onChange={(e) => setMediaEnabled(e.target.checked)} />
        </CardBody>
        <CardHeader title={t("admin.settings.ai")} className="border-t" />
        <CardBody className="space-y-4">
          <Checkbox label={t("admin.settings.aiEnabled")} checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />
          <Field label={t("admin.settings.aiProvider")}>
            {(p) => (
              <Select {...p} value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}>
                <option value="">{t("admin.settings.providerDefault")}</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI</option>
                <option value="demo">DEMO</option>
              </Select>
            )}
          </Field>
        </CardBody>
      </Card>
      <div className="lg:col-span-2">
        <Button
          loading={pending}
          onClick={() =>
            run(
              () =>
                api(`/api/admin/organizations/${org.id}`, {
                  method: "PATCH",
                  body: { name, brandColor: color, mediaEnabled, aiEnabled, aiProvider: aiProvider || null },
                }),
              {
                success: t("admin.settings.saved"),
              },
            )
          }
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

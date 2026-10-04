"use client";

import type { AttributeCategory } from "@prisma/client";
import { useState } from "react";
import { Check, Plus, X, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { VOCABULARY } from "./vocabulary";

export function AttributeActions({ childId, attributeId, pending }: { childId: string; attributeId: string; pending: boolean }) {
  const { t } = useI18n();
  const { pending: busy, run } = useAction();
  const base = `/api/children/${childId}/profile-attributes/${attributeId}`;
  if (pending) {
    return (
      <div className="flex gap-1.5">
        <Button size="sm" loading={busy} onClick={() => run(() => api(`${base}/confirm`, { method: "POST" }))} data-testid={`confirm-${attributeId}`}>
          <Check className="size-4" />
          {t("teacher.profile.confirm")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`${base}/retire`, { method: "POST" }))}>
          <X className="size-4" />
          {t("teacher.profile.dismiss")}
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy}
      onClick={() => run(() => api(`${base}/retire`, { method: "POST" }))}
      aria-label={t("teacher.profile.retire")}
    >
      <Archive className="size-4" />
      <span className="hidden sm:inline">{t("teacher.profile.retire")}</span>
    </Button>
  );
}

const ADDABLE: AttributeCategory[] = [
  "STRENGTH",
  "INTEREST",
  "SUPPORT",
  "TRIGGER",
  "SENSORY",
  "LEARNING_PREFERENCE",
  "EMOTIONAL_REGULATION",
  "SOCIAL_INTERACTION",
  "COMMUNICATION",
  "EXECUTIVE_FUNCTION",
  "PLAY",
  "MOTOR",
  "INDEPENDENCE",
];

export function AddAttributeButton({ childId }: { childId: string }) {
  const { t, locale } = useI18n();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<AttributeCategory>("STRENGTH");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("teacher.profile.add")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("teacher.profile.addTitle")}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!value}
              loading={pending}
              onClick={async () => {
                const ok = await run(() => api(`/api/children/${childId}/profile-attributes`, { body: { category, value, note: note || null } }), {
                  success: t("common.saved"),
                });
                if (ok) {
                  setOpen(false);
                  setValue("");
                  setNote("");
                }
              }}
            >
              {t("common.add")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("teacher.profile.category")}>
            {(p) => (
              <Select
                {...p}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as AttributeCategory);
                  setValue("");
                }}
              >
                {ADDABLE.map((c) => (
                  <option key={c} value={c}>
                    {t(`enums.category.${c}` as MessageKey)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("teacher.profile.value")}>
            {(p) => (
              <Select {...p} value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">—</option>
                {VOCABULARY[category].map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.emoji ? `${v.emoji} ` : ""}
                    {v.label[locale]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("common.notes")}>{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        </div>
      </Dialog>
    </>
  );
}

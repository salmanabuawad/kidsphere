"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

export type FieldDef =
  | { name: string; label: string; type: "text" | "email" | "password" | "date" | "color"; required?: boolean; defaultValue?: string; dir?: "ltr" | "rtl" }
  | { name: string; label: string; type: "textarea"; required?: boolean; defaultValue?: string; rows?: number; mono?: boolean }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; required?: boolean; defaultValue?: string; nullable?: boolean }
  | { name: string; label: string; type: "checkbox"; defaultValue?: boolean }
  | { name: string; label: string; type: "multiselect"; options: { value: string; label: string }[]; defaultValue?: string[] };

type Values = Record<string, string | boolean | string[]>;

/** Config-driven create/edit form in a dialog — used by the admin screens. */
export function SimpleFormDialog({
  title,
  endpoint,
  method = "POST",
  fields,
  submitLabel,
  successMessage,
  trigger,
  nullIfEmpty = [],
  omitIfEmpty = [],
  jsonFields = [],
  extra,
}: {
  title: string;
  endpoint: string;
  method?: "POST" | "PATCH" | "PUT";
  fields: FieldDef[];
  submitLabel?: string;
  successMessage: string;
  trigger?: string;
  /** Declarative body shaping (functions cannot cross the server→client boundary). */
  nullIfEmpty?: string[];
  omitIfEmpty?: string[];
  jsonFields?: string[];
  extra?: Record<string, unknown>;
}) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const initial = (): Values =>
    Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === "checkbox" ? false : f.type === "multiselect" ? [] : "")]));
  const [values, setValues] = useState<Values>(initial);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { ...extra };
    for (const [k, v] of Object.entries(values)) {
      const def = fields.find((f) => f.name === k);
      if (v === "" && omitIfEmpty.includes(k)) continue;
      if (v === "" && (nullIfEmpty.includes(k) || (def?.type === "select" && def.nullable))) {
        body[k] = null;
        continue;
      }
      if (jsonFields.includes(k) && typeof v === "string") {
        try {
          body[k] = JSON.parse(v);
        } catch {
          body[k] = null;
        }
        continue;
      }
      body[k] = v;
    }
    const ok = await run(() => api(endpoint, { method, body }), { success: successMessage });
    if (ok) {
      setOpen(false);
      setValues(initial());
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant={method === "POST" ? "primary" : "outline"} size={method === "POST" ? "md" : "sm"}>
        {method === "POST" && <Plus className="size-4" />}
        {trigger ?? title}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} closeLabel={t("common.close")} size="lg">
        <form onSubmit={onSubmit} className="space-y-4">
          {fields.map((f) => {
            const v = values[f.name];
            const set = (nv: string | boolean | string[]) => setValues({ ...values, [f.name]: nv });
            if (f.type === "checkbox") return <Checkbox key={f.name} label={f.label} checked={!!v} onChange={(e) => set(e.target.checked)} />;
            if (f.type === "multiselect")
              return (
                <fieldset key={f.name}>
                  <legend className="mb-2 text-sm font-medium">{f.label}</legend>
                  <div className="flex flex-wrap gap-3">
                    {f.options.map((o) => (
                      <Checkbox
                        key={o.value}
                        label={o.label}
                        checked={(v as string[]).includes(o.value)}
                        onChange={(e) => set(e.target.checked ? [...(v as string[]), o.value] : (v as string[]).filter((x) => x !== o.value))}
                      />
                    ))}
                  </div>
                </fieldset>
              );
            return (
              <Field key={f.name} label={f.label} required={"required" in f ? f.required : false}>
                {(p) =>
                  f.type === "select" ? (
                    <Select {...p} value={v as string} required={f.required} onChange={(e) => set(e.target.value)}>
                      {(f.nullable || !f.required) && <option value="">—</option>}
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : f.type === "textarea" ? (
                    <Textarea
                      {...p}
                      rows={f.rows ?? 4}
                      className={f.mono ? "font-mono text-xs" : undefined}
                      dir={f.mono ? "ltr" : undefined}
                      value={v as string}
                      required={f.required}
                      onChange={(e) => set(e.target.value)}
                    />
                  ) : (
                    <Input
                      {...p}
                      type={f.type}
                      dir={f.type === "email" || f.type === "password" ? "ltr" : f.dir}
                      value={v as string}
                      required={f.required}
                      onChange={(e) => set(e.target.value)}
                    />
                  )
                }
              </Field>
            );
          })}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {submitLabel ?? t("common.save")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** One-click admin toggle/action (assign, unlink, deactivate…). */
export function ActionButton({
  endpoint,
  method = "POST",
  body,
  label,
  success,
  variant = "ghost",
}: {
  endpoint: string;
  method?: "POST" | "PATCH";
  body: unknown;
  label: string;
  success: string;
  variant?: "ghost" | "outline" | "soft";
}) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant={variant} loading={pending} onClick={() => run(() => api(endpoint, { method, body }), { success })}>
      {label}
    </Button>
  );
}

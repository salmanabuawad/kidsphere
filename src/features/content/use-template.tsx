"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

type ChildOpt = { id: string; displayName: string; goals: { id: string; statement: string }[] };

/** Instantiate a template for one child — only the child's display name is filled in. */
export function UseTemplateButton({ templateId, childOptions: children }: { templateId: string; childOptions: ChildOpt[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [childId, setChildId] = useState(children[0]?.id ?? "");
  const [goalId, setGoalId] = useState("");
  const child = children.find((c) => c.id === childId);
  return (
    <>
      <Button size="sm" variant="soft" onClick={() => setOpen(true)} disabled={children.length === 0}>
        {t("teacher.library.useTemplate")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("teacher.library.useTitle")}
        size="sm"
        closeLabel={t("common.close")}
        footer={
          <Button
            loading={pending}
            onClick={async () => {
              const c = await run(
                () => api<{ id: string }>(`/api/children/${childId}/content-from-template`, { body: { templateId, goalId: goalId || null } }),
                { success: t("teacher.library.created"), refresh: false },
              );
              if (c) router.push(`/teacher/content/${c.id}`);
            }}
          >
            {t("common.create")}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label={t("teacher.library.chooseChild")}>
            {(p) => (
              <Select
                {...p}
                value={childId}
                onChange={(e) => {
                  setChildId(e.target.value);
                  setGoalId("");
                }}
              >
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("teacher.studio.goal")}>
            {(p) => (
              <Select {...p} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                <option value="">—</option>
                {child?.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.statement}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Dialog>
    </>
  );
}

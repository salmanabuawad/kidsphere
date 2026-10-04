import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { LOCALE_NAMES } from "@/lib/i18n/config";
import { listTemplates } from "@/server/services/admin";
import { CONTENT_TYPE_VALUES } from "@/server/validators";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Table } from "@/components/ui/misc";
import { SimpleFormDialog } from "@/features/admin/simple-form";

const EXAMPLE = JSON.stringify(
  {
    kind: "routine",
    title: "{{child}}'s tidy-up steps",
    language: "en",
    ageBand: "3-5",
    goalId: "",
    durationMinutes: 3,
    teacherRationale: { goalUsed: "-", interestsUsed: [], strengthsUsed: [], supportsUsed: [], avoided: [], explanation: "Template" },
    steps: [
      { id: "step1", label: "Listen", narration: "Hear the tidy-up song.", illustration: "🎵" },
      { id: "step2", label: "Tidy", narration: "Put the toys in the basket.", illustration: "🧺" },
    ],
  },
  null,
  2,
);

export default async function TemplatesPage() {
  const actor = await requirePageActor(ADMIN_ROLES);
  const { t } = await getI18n();
  const templates = await listTemplates(actor);
  const fields = (defaults?: { title: string; type: string; language: string; description: string; body: string; isActive: boolean }) =>
    [
      { name: "title", label: t("common.name"), type: "text", required: true, defaultValue: defaults?.title },
      {
        name: "type",
        label: t("teacher.studio.type"),
        type: "select",
        required: true,
        options: CONTENT_TYPE_VALUES.map((v) => ({ value: v, label: t(`enums.contentType.${v}`) })),
        defaultValue: defaults?.type ?? "VISUAL_ROUTINE",
      },
      {
        name: "language",
        label: t("common.language"),
        type: "select",
        required: true,
        options: Object.entries(LOCALE_NAMES).map(([v, l]) => ({ value: v, label: l })),
        defaultValue: defaults?.language ?? "en",
      },
      { name: "description", label: t("admin.templates.description"), type: "text", defaultValue: defaults?.description },
      { name: "body", label: t("admin.templates.body"), type: "textarea", rows: 14, mono: true, required: true, defaultValue: defaults?.body ?? EXAMPLE },
      { name: "isActive", label: t("admin.templates.active"), type: "checkbox", defaultValue: defaults?.isActive ?? true },
    ] as const;

  return (
    <div>
      <PageHeader
        title={t("admin.templates.title")}
        description={t("admin.templates.subtitle")}
        actions={
          <SimpleFormDialog
            title={t("admin.templates.create")}
            endpoint="/api/admin/templates"
            successMessage={t("admin.templates.saved")}
            fields={[...fields()]}
            nullIfEmpty={["description"]}
            jsonFields={["body"]}
          />
        }
      />
      <Table>
        <thead>
          <tr>
            <th>{t("common.name")}</th>
            <th>{t("teacher.studio.type")}</th>
            <th>{t("common.language")}</th>
            <th>{t("common.status")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((tpl) => (
            <tr key={tpl.id}>
              <td className="font-medium" dir="auto">
                {tpl.title}
                {tpl.description && <span className="text-muted block text-xs">{tpl.description}</span>}
              </td>
              <td>{t(`enums.contentType.${tpl.type}`)}</td>
              <td>{LOCALE_NAMES[tpl.language]}</td>
              <td>{tpl.isActive ? <Badge tone="green">{t("admin.templates.active")}</Badge> : <Badge tone="stone">—</Badge>}</td>
              <td>
                {(actor.role === "SUPER_ADMIN" || tpl.organizationId === actor.organizationId) && (
                  <SimpleFormDialog
                    title={t("common.edit")}
                    trigger={t("common.edit")}
                    method="PUT"
                    endpoint={`/api/admin/templates/${tpl.id}`}
                    successMessage={t("admin.templates.saved")}
                    fields={[
                      ...fields({
                        title: tpl.title,
                        type: tpl.type,
                        language: tpl.language,
                        description: tpl.description ?? "",
                        body: JSON.stringify(tpl.body, null, 2),
                        isActive: tpl.isActive,
                      }),
                    ]}
                    nullIfEmpty={["description"]}
                    jsonFields={["body"]}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

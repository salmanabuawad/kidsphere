import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { listAdminChildren, listAdminClasses, listUsers } from "@/server/services/admin";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ActionButton, SimpleFormDialog } from "@/features/admin/simple-form";
import type { PersonRelation } from "@prisma/client";

const RELATIONS: PersonRelation[] = ["MOTHER", "FATHER", "GRANDPARENT", "FAMILY_MEMBER"];

export default async function AssignmentsPage() {
  const actor = await requirePageActor(ADMIN_ROLES);
  const { t } = await getI18n();
  const [classes, users, children] = await Promise.all([listAdminClasses(actor), listUsers(actor), listAdminChildren(actor)]);
  const teachers = users.filter((u) => u.role === "TEACHER");
  const parents = users.filter((u) => u.role === "PARENT");

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.assignments.title")} />
      <Card>
        <CardHeader
          title={t("admin.assignments.teachers")}
          action={
            <SimpleFormDialog
              title={t("admin.assignments.assign")}
              endpoint="/api/admin/assignments/teacher"
              successMessage={t("admin.assignments.saved")}
              fields={[
                {
                  name: "userId",
                  label: t("admin.assignments.teacher"),
                  type: "select",
                  required: true,
                  options: teachers.map((u) => ({ value: u.id, label: u.name })),
                  defaultValue: teachers[0]?.id,
                },
                {
                  name: "classId",
                  label: t("admin.children.class"),
                  type: "select",
                  required: true,
                  options: classes.map((c) => ({ value: c.id, label: `${c.name} (${c.kindergarten.name})` })),
                  defaultValue: classes[0]?.id,
                },
              ]}
              extra={{ assign: true }}
            />
          }
        />
        <CardBody className="divide-line divide-y">
          {classes.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 py-3">
              <span className="w-48 font-medium">{c.name}</span>
              <div className="flex flex-1 flex-wrap gap-2">
                {c.teachers.length === 0 && <span className="text-muted text-sm">—</span>}
                {c.teachers.map((tt) => (
                  <span key={tt.userId} className="inline-flex items-center gap-1 rounded-full bg-stone-100 ps-3 text-sm">
                    {tt.user.name}
                    <ActionButton
                      endpoint="/api/admin/assignments/teacher"
                      body={{ classId: c.id, userId: tt.userId, assign: false }}
                      label="×"
                      success={t("admin.assignments.saved")}
                    />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("admin.assignments.parents")}
          action={
            <SimpleFormDialog
              title={t("admin.assignments.link")}
              endpoint="/api/admin/assignments/parent"
              successMessage={t("admin.assignments.saved")}
              fields={[
                {
                  name: "parentId",
                  label: t("admin.assignments.parent"),
                  type: "select",
                  required: true,
                  options: parents.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
                  defaultValue: parents[0]?.id,
                },
                {
                  name: "childId",
                  label: t("admin.assignments.child"),
                  type: "select",
                  required: true,
                  options: children.map((c) => ({ value: c.id, label: c.firstName })),
                  defaultValue: children[0]?.id,
                },
                {
                  name: "relation",
                  label: t("admin.assignments.relation"),
                  type: "select",
                  required: true,
                  options: RELATIONS.map((r) => ({ value: r, label: t(`enums.relation.${r}`) })),
                  defaultValue: "MOTHER",
                },
              ]}
              extra={{ link: true }}
            />
          }
        />
        <CardBody className="divide-line divide-y">
          {children.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 py-3">
              <span className="w-48 font-medium">{c.firstName}</span>
              <div className="flex flex-1 flex-wrap gap-2">
                {c.parents.length === 0 && <span className="text-muted text-sm">—</span>}
                {c.parents.map((p) => (
                  <span key={p.parentId} className="inline-flex items-center gap-1 rounded-full bg-stone-100 ps-3 text-sm">
                    {p.parent.name} · {t(`enums.relation.${p.relation}`)}
                    <ActionButton
                      endpoint="/api/admin/assignments/parent"
                      body={{ childId: c.id, parentId: p.parentId, relation: p.relation, link: false }}
                      label="×"
                      success={t("admin.assignments.saved")}
                    />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

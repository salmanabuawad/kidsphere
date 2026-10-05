import { useMemo, useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2, UserRoundCog } from "lucide-react";
import { ChildrenIcon, ClassesIcon, ParentHomeIcon } from "@/icons";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { PageSkeleton, Spinner } from "@/components/ui/Spinner";
import { useI18n } from "@/i18n/I18nProvider";
import { api, isApiError } from "@/lib/api";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { ClassDialog, TeachersDialog } from "./ClassDialogs";
import { ConfirmDialog } from "./ConfirmDialog";
import { childrenOf, displayName, type ClassRow } from "./types";

/** Children of one class (GET /api/children?class_id=…, WP-05) with a "Parents" link each. */
function ClassChildren({ klass }: { klass: ClassRow }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading } = useFetch<unknown>("/api/children", { class_id: klass.id });
  const kids = childrenOf(data).filter((c) => !c.class_id || c.class_id === klass.id);
  if (loading && data === undefined) return <Spinner label={t("common.loading")} />;
  if (error) return <p className="text-sm text-ink-muted">{isApiError(error, "NOT_FOUND") ? t("admin.classes.childrenUnavailable") : toMessage(error)}</p>;
  if (kids.length === 0) return <p className="text-sm text-ink-muted">{t("admin.classes.noChildren")}</p>;
  return (
    <ul className="divide-y divide-line">
      {kids.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar name={displayName(c)} size="sm" />
            <span className="truncate font-medium" dir="auto">
              {displayName(c)}
            </span>
          </span>
          <ButtonLink to={paths.adminChildParents(c.id)} size="sm" variant="soft" icon={<ParentHomeIcon paint={false} />}>
            {t("admin.classes.parents")}
          </ButtonLink>
        </li>
      ))}
    </ul>
  );
}

function ClassCard({
  klass,
  onEdit,
  onTeachers,
  onDelete,
}: {
  klass: ClassRow;
  onEdit: () => void;
  onTeachers: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Card data-testid={`class-${klass.name}`}>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink" dir="auto">
              {klass.name}
            </h3>
            <p className="text-sm text-ink-muted">{t("admin.classes.childCount", { count: klass.child_count })}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={onEdit}>
              {t("common.edit")}
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={onDelete}>
              {t("common.delete")}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-caption font-medium text-ink-muted">{t("admin.classes.teachers")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {klass.teachers.length === 0 ? (
              <span className="text-sm text-ink-muted">{t("admin.classes.noTeacherAssigned")}</span>
            ) : (
              klass.teachers.map((tch) => (
                <Chip key={tch.id} tone="outline">
                  {tch.name}
                </Chip>
              ))
            )}
            <Button size="sm" variant="outline" icon={<UserRoundCog className="size-4" />} onClick={onTeachers}>
              {t("admin.classes.assignTeachers")}
            </Button>
          </div>
        </div>

        <div className="border-t border-line pt-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-sm font-medium text-ink hover:text-brand"
          >
            <span className="flex items-center gap-2">
              <ChildrenIcon className="size-5" paint={false} aria-hidden />
              {t("admin.classes.showChildren")}
            </span>
            <ChevronDown className={cn("size-4 text-ink-muted transition-transform", open && "rotate-180")} aria-hidden />
          </button>
          {open && (
            <div className="pt-1">
              <ClassChildren klass={klass} />
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export function ClassesPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload } = useFetch<{ classes: ClassRow[] }>("/api/classes");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [teachersFor, setTeachersFor] = useState<ClassRow | null>(null);
  const [deleting, setDeleting] = useState<ClassRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { pending, run } = useAction();

  const classes = useMemo(() => data?.classes ?? [], [data]);
  const kindergartens = useMemo(() => [...new Set(classes.map((c) => c.kindergarten))], [classes]);
  const groups = useMemo(() => kindergartens.map((k) => ({ kindergarten: k, classes: classes.filter((c) => c.kindergarten === k) })), [kindergartens, classes]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    const r = await run(() => api(`/api/classes/${encodeURIComponent(deleting.id)}`, { method: "DELETE" }), {
      success: t("admin.classes.deleted", { name: deleting.name }),
      errorToast: false,
      onSuccess: reload,
      onError: (err) => setDeleteError(isApiError(err, "CONFLICT") ? t("admin.classes.deleteBlocked") : toMessage(err)),
    });
    if (r.ok) setDeleting(null);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={<ClassesIcon />}
        title={t("admin.classes.title")}
        description={t("admin.classes.subtitle")}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t("admin.classes.add")}
          </Button>
        }
      />

      {error ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && !data ? (
        <PageSkeleton />
      ) : classes.length === 0 ? (
        <EmptyState
          icon={<ClassesIcon />}
          title={t("admin.classes.empty")}
          description={t("admin.classes.emptyHint")}
          action={
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t("admin.classes.add")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.kindergarten} aria-label={g.kindergarten}>
              <SectionTitle icon={<ClassesIcon className="size-5" />}>
                <span dir="auto">{g.kindergarten}</span>
              </SectionTitle>
              <div className="grid gap-4 md:grid-cols-2">
                {g.classes.map((c) => (
                  <ClassCard
                    key={c.id}
                    klass={c}
                    onEdit={() => setEditing(c)}
                    onTeachers={() => setTeachersFor(c)}
                    onDelete={() => {
                      setDeleteError(null);
                      setDeleting(c);
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ClassDialog
        open={creating || !!editing}
        klass={editing}
        kindergartens={kindergartens}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          reload();
        }}
      />
      <TeachersDialog
        klass={teachersFor}
        onClose={() => setTeachersFor(null)}
        onSaved={() => {
          setTeachersFor(null);
          reload();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={t("admin.classes.deleteTitle", { name: deleting?.name ?? "" })}
        confirmLabel={t("common.delete")}
        pending={pending}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      >
        {deleteError ? <Alert tone="warning">{deleteError}</Alert> : t("admin.classes.deleteBody")}
      </ConfirmDialog>
    </div>
  );
}

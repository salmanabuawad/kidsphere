import { useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { HeartHandshake, Link2, Unlink, UserPlus } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Spinner";
import { useI18n } from "@/i18n/I18nProvider";
import { api, isApiError } from "@/lib/api";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { ConfirmDialog } from "./ConfirmDialog";
import { UserDialog } from "./UserDialog";
import { childOf, displayName, type AdminUser, type ParentLink } from "./types";

/** /admin/children/:id/parents: link and unlink parent accounts for one child. */
export function ChildParentsPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { list, optionLabel } = useOptions();
  const childReq = useFetch<unknown>(`/api/children/${encodeURIComponent(id)}`);
  const links = useFetch<{ parents: ParentLink[] }>(`/api/children/${encodeURIComponent(id)}/parents`);
  const users = useFetch<{ users: AdminUser[] }>("/api/users", { role: "parent" });
  const { pending, run } = useAction();

  const [userId, setUserId] = useState("");
  const [relation, setRelation] = useState("");
  const [creating, setCreating] = useState(false);
  const [unlinking, setUnlinking] = useState<ParentLink | null>(null);

  const child = childOf(childReq.data);
  const childName = child ? displayName(child) : null;
  const linked = useMemo(() => links.data?.parents ?? [], [links.data]);
  const linkedIds = useMemo(() => new Set(linked.map((p) => p.id)), [linked]);
  const candidates = useMemo(
    () => (users.data?.users ?? []).filter((u) => u.role === "parent" && u.is_active && !linkedIds.has(u.id)),
    [users.data, linkedIds],
  );
  const relations = list("relations");

  async function link(targetId: string) {
    const r = await run(
      () => api(`/api/children/${encodeURIComponent(id)}/parents`, { body: { user_id: targetId, relation: relation || null } }),
      { success: t("admin.parents.linked") },
    );
    if (r.ok) {
      setUserId("");
      setRelation("");
      links.reload();
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (userId) await link(userId);
  }

  async function unlink() {
    if (!unlinking) return;
    const r = await run(() => api(`/api/children/${encodeURIComponent(id)}/parents/${encodeURIComponent(unlinking.id)}`, { method: "DELETE" }), {
      success: t("admin.parents.unlinked", { name: unlinking.name }),
    });
    if (r.ok) {
      setUnlinking(null);
      links.reload();
    }
  }

  const back = { to: paths.adminClasses(), label: t("admin.classes.title") };

  if (links.error && isApiError(links.error, "NOT_FOUND")) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={back} icon={<HeartHandshake />} title={t("admin.parents.title")} />
        <EmptyState icon={<HeartHandshake />} title={t("admin.parents.childNotFound")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={back}
        icon={<HeartHandshake />}
        eyebrow={childName ? <span dir="auto">{childName}</span> : undefined}
        title={childName ? t("admin.parents.titleFor", { name: childName }) : t("admin.parents.title")}
        description={t("admin.parents.subtitle")}
      />

      <div className="space-y-5">
        <Card>
          <CardHeader icon={<HeartHandshake className="size-4" />} title={t("admin.parents.linkedTitle")} />
          <CardBody>
            {links.error ? (
              <Alert tone="error" action={<Button size="sm" variant="outline" onClick={links.reload}>{t("common.retry")}</Button>}>
                {toMessage(links.error)}
              </Alert>
            ) : links.loading && !links.data ? (
              <PageSkeleton />
            ) : linked.length === 0 ? (
              <p className="text-sm text-muted">{t("admin.parents.none")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {linked.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`linked-${p.email}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={p.name} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <span dir="auto" className="truncate">
                            {p.name}
                          </span>
                          {p.relation && <Badge tone="helps">{optionLabel("relations", p.relation)}</Badge>}
                          {!p.is_active && <Badge tone="neutral">{t("admin.users.inactive")}</Badge>}
                        </p>
                        <p className="truncate text-sm text-muted" dir="ltr">
                          <bdi>{p.email}</bdi>
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" icon={<Unlink className="size-4" />} onClick={() => setUnlinking(p)}>
                      {t("admin.parents.unlink")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Link2 className="size-4" />} title={t("admin.parents.linkTitle")} description={t("admin.parents.linkHint")} />
          <CardBody>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end" noValidate>
              <Field label={t("admin.parents.account")}>
                {(p) => (
                  <Select {...p} value={userId} onChange={(e) => setUserId(e.target.value)} disabled={users.loading && !users.data}>
                    <option value="">{candidates.length ? t("admin.parents.choose") : t("admin.parents.noCandidates")}</option>
                    {candidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.email}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("admin.parents.relation")}>
                {(p) => (
                  <Select {...p} value={relation} onChange={(e) => setRelation(e.target.value)}>
                    <option value="">{t("common.optional")}</option>
                    {relations.map((r) => (
                      <option key={r.key} value={r.key}>
                        {optionLabel("relations", r.key)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button type="submit" icon={<Link2 className="size-4" />} loading={pending} disabled={!userId}>
                {t("admin.parents.link")}
              </Button>
            </form>
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <p className="text-sm text-muted">{t("admin.parents.noAccountYet")}</p>
              <Button variant="outline" size="sm" icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>
                {t("admin.parents.createParent")}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <UserDialog
        open={creating}
        defaultRole="parent"
        lockRole
        onClose={() => setCreating(false)}
        onSaved={(u) => {
          setCreating(false);
          users.reload();
          void link(u.id);
        }}
      />
      <ConfirmDialog
        open={!!unlinking}
        title={t("admin.parents.unlinkTitle", { name: unlinking?.name ?? "" })}
        confirmLabel={t("admin.parents.unlink")}
        pending={pending}
        onClose={() => setUnlinking(null)}
        onConfirm={() => void unlink()}
      >
        {t("admin.parents.unlinkBody")}
      </ConfirmDialog>
    </div>
  );
}

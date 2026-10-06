import { FitPager } from "@/components/ui/FitPager";
import { useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Search, UserCheck, UserX } from "lucide-react";
import { UsersIcon } from "@/icons";
import { useAuth, useUser } from "@/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import type { Role } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { ConfirmDialog } from "./ConfirmDialog";
import { PasswordDialog } from "./PasswordDialog";
import { UserDialog } from "./UserDialog";
import { ROLES, type AdminUser } from "./types";

// Roles are not profile meanings, so they never borrow the meaning tints.
const roleTone = { admin: "brand", teacher: "neutral", parent: "outline" } as const;

function UserRow({
  user,
  isSelf,
  onEdit,
  onPassword,
  onToggleActive,
}: {
  user: AdminUser;
  isSelf: boolean;
  onEdit: () => void;
  onPassword: () => void;
  onToggleActive: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5" data-testid={`user-row-${user.email}`}>
      <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
        <Avatar name={user.name} className={user.is_active ? undefined : "opacity-50"} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
            <span className="truncate" dir="auto">
              {user.name}
            </span>
            {isSelf && <Badge tone="outline">{t("admin.users.you")}</Badge>}
          </p>
          <p className="truncate text-sm text-ink-muted" dir="ltr">
            <bdi>{user.email}</bdi>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={roleTone[user.role]}>{t(`common.roles.${user.role}`)}</Badge>
        {!user.is_active && <Badge tone="neutral">{t("admin.users.inactive")}</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={onEdit}>
          {t("common.edit")}
        </Button>
        <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" />} onClick={onPassword}>
          {t("admin.users.password")}
        </Button>
        {!isSelf && (
          <Button
            size="sm"
            variant="ghost"
            icon={user.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
            onClick={onToggleActive}
          >
            {user.is_active ? t("admin.users.deactivate") : t("admin.users.activate")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function UsersPage() {
  const { t } = useI18n();
  const me = useUser();
  const { refresh } = useAuth();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload } = useFetch<{ users: AdminUser[] }>("/api/users");
  const [role, setRole] = useState<"all" | Role>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [pwUser, setPwUser] = useState<AdminUser | null>(null);
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null);
  const { pending, run } = useAction();

  const users = useMemo(() => data?.users ?? [], [data]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter(
      (u) => (role === "all" || u.role === role) && (!needle || u.name.toLowerCase().includes(needle) || u.email.includes(needle)),
    );
  }, [users, role, q]);

  const counts = useMemo(() => Object.fromEntries(ROLES.map((r) => [r, users.filter((u) => u.role === r).length])), [users]);

  async function setActive(user: AdminUser, active: boolean) {
    const r = await run(() => api(`/api/users/${encodeURIComponent(user.id)}`, { method: "PUT", body: { is_active: active } }), {
      success: active ? t("admin.users.activated", { name: user.name }) : t("admin.users.deactivated", { name: user.name }),
      onSuccess: reload,
    });
    if (r.ok) setDeactivating(null);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={<UsersIcon />}
        title={t("admin.users.title")}
        description={t("admin.users.subtitle")}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t("admin.users.add")}
          </Button>
        }
      />

      <Tabs
        label={t("admin.users.filterByRole")}
        value={role}
        onChange={(k) => setRole(k as "all" | Role)}
        tabs={[
          { key: "all", label: t("common.all") },
          { key: "admin", label: t("admin.users.roleTabs.admin") },
          { key: "teacher", label: t("admin.users.roleTabs.teacher") },
          { key: "parent", label: t("admin.users.roleTabs.parent") },
        ].map((tab) => ({ ...tab, label: tab.key !== "all" && counts[tab.key] ? `${tab.label} (${counts[tab.key]})` : tab.label }))}
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Input
          type="search"
          aria-label={t("admin.users.search")}
          placeholder={t("admin.users.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="bg-tray ps-11"
        />
      </div>

      {error ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && !data ? (
        <PageSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState
          scene={users.length > 0 ? "search" : undefined}
          icon={<UsersIcon />}
          title={users.length === 0 ? t("admin.users.empty") : t("admin.users.noMatch")}
          action={
            users.length === 0 ? (
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                {t("admin.users.add")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <FitPager as="ul" className="divide-y divide-line" reserve={120}>
            {shown.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === me.id}
                onEdit={() => setEditing(u)}
                onPassword={() => setPwUser(u)}
                onToggleActive={() => (u.is_active ? setDeactivating(u) : void setActive(u, true))}
              />
            ))}
          </FitPager>
        </Card>
      )}

      <UserDialog
        open={creating || !!editing}
        user={editing}
        defaultRole={role === "all" ? "teacher" : role}
        isSelf={!!editing && editing.id === me.id}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={(saved) => {
          setCreating(false);
          setEditing(null);
          reload();
          if (saved.id === me.id) void refresh();
        }}
      />
      <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} />
      <ConfirmDialog
        open={!!deactivating}
        title={t("admin.users.deactivateTitle", { name: deactivating?.name ?? "" })}
        confirmLabel={t("admin.users.deactivate")}
        pending={pending}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && void setActive(deactivating, false)}
      >
        {t("admin.users.deactivateBody")}
      </ConfirmDialog>
    </div>
  );
}

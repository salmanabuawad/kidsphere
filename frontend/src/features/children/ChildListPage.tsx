import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArchiveRestore, Eye, FileText, PencilLine, Plus, Search, Users, Zap } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Alert, Badge, Button, ButtonLink, Card, Checkbox, EmptyState, Input, PageHeader, PageSkeleton, Select } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { paths } from "@/lib/paths";
import { useFetch } from "@/lib/useFetch";
import { useErrorMessage } from "@/lib/useAction";
import { displayName, notObservedRecently } from "./api";
import { ChildAvatar } from "./ChildAvatar";
import type { ChildCard, ChildListResponse } from "./types";

/** Locale-aware, case-insensitive "contains" on name and preferred name. */
function matches(c: ChildCard, q: string): boolean {
  const needle = q.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [c.name, c.preferred_name ?? ""].some((s) => s.toLocaleLowerCase().includes(needle));
}

/** Teacher home (/children): warm child cards, attention strips, class filter and search. */
export function ChildListPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toMessage = useErrorMessage();
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, loading, reload } = useFetch<ChildListResponse>("/api/children", { include_archived: showArchived || undefined });

  const children = useMemo(() => data?.children ?? [], [data]);
  const classes = data?.classes ?? [];
  const visible = useMemo(
    () => children.filter((c) => (!classId || c.class?.id === classId) && matches(c, q)),
    [children, classId, q],
  );
  const inClass = useMemo(() => children.filter((c) => !c.archived && (!classId || c.class?.id === classId)), [children, classId]);
  const drafts = inClass.filter((c) => (c.draft_content_count ?? 0) > 0);
  const notObserved = inClass.filter((c) => notObservedRecently(c.last_observation_at));
  const filtering = !!q.trim() || !!classId;

  return (
    <div>
      <PageHeader
        icon={<Users />}
        title={t("children.list.title")}
        description={t("children.list.description")}
        actions={
          <ButtonLink to={paths.newChild()} size="lg" icon={<Plus className="size-5" aria-hidden />}>
            {t("children.list.add")}
          </ButtonLink>
        }
      />

      {error && (
        <Alert
          tone="error"
          className="mb-4"
          action={
            <Button size="sm" variant="outline" onClick={reload}>
              {t("common.retry")}
            </Button>
          }
        >
          {toMessage(error)}
        </Alert>
      )}

      {children.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              type="search"
              dir="auto"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("children.list.searchPlaceholder")}
              aria-label={t("children.list.searchLabel")}
              className="ps-9"
            />
          </div>
          {classes.length > 1 && (
            <div className="sm:w-64">
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label={t("children.list.classFilter")}>
                <option value="">{t("children.list.allClasses")}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.kindergarten ? `${c.name} · ${c.kindergarten}` : c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {isAdmin && (
            <Checkbox label={t("children.list.showArchived")} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          )}
        </div>
      )}

      {children.length > 0 && !filtering && (drafts.length > 0 || notObserved.length > 0) && (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          {drafts.length > 0 && (
            <Strip
              tone="brand"
              icon={<FileText className="size-4" aria-hidden />}
              title={t("children.list.draftsStrip")}
              hint={t("children.list.draftsStripHint")}
              items={drafts}
              to={(c) => paths.childContent(c.id)}
            />
          )}
          {notObserved.length > 0 && (
            <Strip
              tone="attention"
              icon={<Eye className="size-4" aria-hidden />}
              title={t("children.list.notObservedStrip")}
              hint={t("children.list.notObservedStripHint")}
              items={notObserved}
              to={(c) => paths.childObserve(c.id)}
            />
          )}
        </div>
      )}

      {loading && !data ? (
        <PageSkeleton />
      ) : children.length === 0 && !error ? (
        <EmptyState
          icon={<Users />}
          title={t("children.list.empty")}
          description={t("children.list.emptyHint")}
          action={
            <ButtonLink to={paths.newChild()} size="lg" icon={<Plus className="size-5" aria-hidden />}>
              {t("children.list.add")}
            </ButtonLink>
          }
        />
      ) : visible.length === 0 && filtering ? (
        <EmptyState
          icon={<Search />}
          title={t("children.list.noMatch")}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                setClassId("");
              }}
            >
              {t("children.list.clearFilters")}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="child-cards">
          {visible.map((c) => (
            <li key={c.id}>
              <ChildListCard child={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChildListCard({ child }: { child: ChildCard }) {
  const { t } = useI18n();
  const { formatAge } = useFormat();
  const name = displayName(child);
  const drafts = (child.draft_content_count ?? 0) > 0;
  const quiet = !child.archived && notObservedRecently(child.last_observation_at);
  return (
    <Card className="flex h-full flex-col p-4 transition-shadow hover:shadow-md">
      <Link to={paths.child(child.id)} className="-m-1 flex items-center gap-3 rounded-xl p-1" data-testid={`child-card-${child.id}`}>
        <ChildAvatar child={child} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-ink" dir="auto">
            {name}
          </p>
          {child.preferred_name && child.preferred_name !== child.name && (
            <p className="truncate text-xs text-muted" dir="auto">
              {child.name}
            </p>
          )}
          <p className="text-sm text-muted">{formatAge(child.birth_date)}</p>
          {child.class && (
            <p className="truncate text-xs text-muted" dir="auto">
              {child.class.name}
            </p>
          )}
        </div>
      </Link>
      <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
        {child.archived && (
          <Badge tone="neutral" icon={<ArchiveRestore className="size-3" aria-hidden />}>
            {t("children.list.archived")}
          </Badge>
        )}
        {child.wizard_completed === false && (
          <Badge tone="helps" icon={<PencilLine className="size-3" aria-hidden />}>
            {t("children.list.profileInProgress")}
          </Badge>
        )}
        {drafts && (
          <Badge tone="brand" icon={<FileText className="size-3" aria-hidden />}>
            {t("children.list.drafts")}
          </Badge>
        )}
        {quiet && (
          <Badge tone="attention" icon={<Eye className="size-3" aria-hidden />}>
            {t("children.list.notObserved")}
          </Badge>
        )}
      </div>
      <div className="mt-auto flex gap-2 pt-4">
        <ButtonLink to={paths.childObserve(child.id)} variant="soft" className="flex-1" icon={<Zap className="size-4" aria-hidden />}>
          {t("children.list.observe")}
        </ButtonLink>
        <ButtonLink to={paths.child(child.id)} variant="outline" className="flex-1">
          {t("children.list.open")}
        </ButtonLink>
      </div>
    </Card>
  );
}

function Strip({
  tone,
  icon,
  title,
  hint,
  items,
  to,
}: {
  tone: "brand" | "attention";
  icon: ReactNode;
  title: string;
  hint: string;
  items: ChildCard[];
  to: (c: ChildCard) => string;
}) {
  const box = tone === "brand" ? "border-teal-200 bg-teal-50/60" : "border-amber-200 bg-amber-50/70";
  const head = tone === "brand" ? "text-brand" : "text-amber-900";
  return (
    <section className={`rounded-2xl border px-4 py-3 ${box}`} aria-label={title}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 className={`flex items-center gap-1.5 text-sm font-semibold ${head}`}>
          {icon}
          {title}
        </h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {items.map((c) => (
          <li key={c.id} className="shrink-0">
            <Link
              to={to(c)}
              className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-white py-1 ps-1 pe-3 text-sm font-medium text-ink shadow-sm hover:border-stone-300"
            >
              <ChildAvatar child={c} size="sm" />
              <span dir="auto">{displayName(c)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArchiveRestore, Calendar, PencilLine, Plus, Search } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Alert, Badge, Button, ButtonLink, cardTappable, Checkbox, Chip, EmptyState, Input, PageHeader, PageSkeleton, Select } from "@/components/ui";
import { AttentionIcon, ChildrenIcon, ContentIcon, StrengthsIcon } from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { paths } from "@/lib/paths";
import { useFetch } from "@/lib/useFetch";
import { useErrorMessage } from "@/lib/useAction";
import { cn } from "@/lib/utils";
import { displayName, notObservedRecently } from "./api";
import { ChildAvatar } from "./ChildAvatar";
import { useProfileItem } from "./ProfileItems";
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
        icon={<ChildrenIcon />}
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
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input
              type="search"
              dir="auto"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("children.list.searchPlaceholder")}
              aria-label={t("children.list.searchLabel")}
              className="bg-tray ps-11"
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
              icon={<ContentIcon />}
              title={t("children.list.draftsStrip")}
              hint={t("children.list.draftsStripHint")}
              items={drafts}
              to={(c) => paths.childContent(c.id)}
            />
          )}
          {notObserved.length > 0 && (
            <Strip
              tone="attention"
              icon={<AttentionIcon />}
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
          scene="children"
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
          scene="search"
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
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="child-cards">
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

/** Strength chips on a list card: at most this many, then a neutral "+N" (design-system ChildCard). */
const CARD_STRENGTHS = 2;

/**
 * Teacher list card (spec 6.6, design-system ChildCard): the whole card is one tappable
 * link to the profile, with no buttons inside (Observe lives in the bottom bar and on the
 * profile). Avatar | name, age, class and the first strengths (strengths first) | last
 * observed; status badges; a worth-a-look strip when the child has not been observed
 * lately (tangerine, never red).
 */
function ChildListCard({ child }: { child: ChildCard }) {
  const { t } = useI18n();
  const { formatAge, formatRelativeDays } = useFormat();
  const resolve = useProfileItem();
  const name = displayName(child);
  const drafts = (child.draft_content_count ?? 0) > 0;
  const quiet = !child.archived && notObservedRecently(child.last_observation_at);
  const strengths = child.strengths ?? [];
  const shownStrengths = strengths.slice(0, CARD_STRENGTHS);
  const moreStrengths = strengths.length - shownStrengths.length;
  return (
    <Link
      to={paths.child(child.id)}
      className={cn("flex h-full flex-col rounded-lg border border-line bg-surface p-3 text-ink sm:px-4", cardTappable)}
      data-testid={`child-card-${child.id}`}
    >
      <div className="grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3">
        <ChildAvatar child={child} size="lg" />
        <div className="min-w-0">
          <p className="text-name truncate font-semibold text-ink" dir="auto">
            {name}
          </p>
          {child.preferred_name && child.preferred_name !== child.name && (
            <p className="text-caption truncate text-ink-muted" dir="auto">
              {child.name}
            </p>
          )}
          <p className="text-caption tabular text-ink-muted">{formatAge(child.birth_date)}</p>
          {child.class && (
            <p className="text-caption truncate text-ink-muted" dir="auto">
              {child.class.name}
            </p>
          )}
        </div>
        {child.last_observation_at && (
          <span className="text-caption tabular inline-flex items-center gap-1 text-ink-muted">
            <Calendar className="size-3.5 shrink-0" aria-hidden />
            {formatRelativeDays(child.last_observation_at)}
          </span>
        )}
        {shownStrengths.length > 0 && (
          <ul className="col-span-2 col-start-2 mt-2 flex min-w-0 flex-nowrap gap-2" aria-label={t("children.profile.strengths")}>
            {shownStrengths.map((it, i) => (
              <li key={it.key ?? it.custom ?? i} className="min-w-0">
                <Chip
                  tone="strength"
                  icon={<StrengthsIcon size={16} />}
                  className="max-w-full [&>span:last-child]:min-w-0 [&>span:last-child]:truncate"
                >
                  {resolve("strengths", it).label}
                </Chip>
              </li>
            ))}
            {moreStrengths > 0 && (
              <li className="shrink-0">
                <Chip tone="neutral" className="tabular">
                  +{moreStrengths}
                </Chip>
              </li>
            )}
          </ul>
        )}
      </div>
      {(child.archived || child.wizard_completed === false || drafts) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {child.archived && (
            <Badge tone="muted" icon={<ArchiveRestore aria-hidden />}>
              {t("children.list.archived")}
            </Badge>
          )}
          {child.wizard_completed === false && (
            <Badge tone="neutral" icon={<PencilLine aria-hidden />}>
              {t("children.list.profileInProgress")}
            </Badge>
          )}
          {drafts && (
            <Badge tone="brand" icon={<ContentIcon paint={false} aria-hidden />}>
              {t("children.list.drafts")}
            </Badge>
          )}
        </div>
      )}
      {quiet && (
        // mt-auto keeps the strip on the card's bottom edge across a grid row; pt-3 is the minimum gap.
        <div className="mt-auto pt-3">
          <p className="text-caption flex items-center gap-2 rounded-md bg-attention-soft px-3 py-2 font-medium text-ink">
            <AttentionIcon size={16} className="shrink-0" aria-hidden />
            {t("children.list.notObserved")}
          </p>
        </div>
      )}
    </Link>
  );
}

/** A worth-a-look strip above the cards: drafts to review (brand) or not observed lately (attention). */
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
  return (
    <section className={cn("rounded-lg px-4 py-3", tone === "brand" ? "bg-brand-soft" : "bg-attention-soft")} aria-label={title}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink [&_svg]:size-5">
          {icon}
          {title}
        </h2>
        <p className="text-caption text-ink-muted">{hint}</p>
      </div>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-0.5 pb-1.5">
        {items.map((c) => (
          <li key={c.id} className="shrink-0">
            <Link
              to={to(c)}
              className="ks-press flex min-h-11 items-center gap-2 rounded-md border border-line bg-surface py-1 ps-1 pe-3 text-sm font-semibold text-ink shadow-lip hover:bg-tray active:translate-y-0.5 active:shadow-none"
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

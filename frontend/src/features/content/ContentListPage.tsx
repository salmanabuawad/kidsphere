/**
 * /children/:id/content — the child's "Content" tab: drafts waiting for
 * review, ready to use, used and archived, with small packs grouped together.
 */
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronDown, ChevronRight, Package, Play, Plus, Sparkles } from "lucide-react";
import { Alert, Badge, Button, ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { ChildLayout } from "@/features/children";
import { useI18n } from "@/i18n/I18nProvider";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { contentListUrl, groupByPack, isUsable, STATUS_ORDER, type ContentListResponse, type ContentStatus, type ContentSummary } from "./api";
import { ModeBadge, ResultBadge, TypeIcon, typeKey } from "./ui";

export function ContentListPage() {
  const { id = "" } = useParams();
  return (
    <ChildLayout childId={id}>
      <ContentList childId={id} />
    </ChildLayout>
  );
}

export function ContentList({ childId }: { childId: string }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload } = useFetch<ContentListResponse>(contentListUrl(childId));
  const [showArchived, setShowArchived] = useState(false);
  const items = data?.content ?? [];
  const byStatus = (s: ContentStatus) => items.filter((c) => (c.status ?? "draft") === s);
  const archived = byStatus("archived");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-ink">{t("content.list.title")}</h2>
        <ButtonLink to={paths.newContent(childId)} size="lg" icon={<Plus className="size-5" aria-hidden />}>
          {t("content.list.create")}
        </ButtonLink>
      </div>

      {error ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title={t("content.list.empty")}
          description={t("content.list.emptyHint")}
          action={
            <ButtonLink to={paths.newContent(childId)} icon={<Plus className="size-4" aria-hidden />}>
              {t("content.list.create")}
            </ButtonLink>
          }
        />
      ) : (
        <>
          {STATUS_ORDER.filter((s) => s !== "archived").map((s) => {
            const list = byStatus(s);
            if (list.length === 0) return null;
            return <StatusSection key={s} status={s} items={list} />;
          })}
          {archived.length > 0 && (
            <section>
              <Button variant="ghost" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} icon={<ChevronDown className={cn("size-4 transition-transform", !showArchived && "-rotate-90 rtl:rotate-90")} aria-hidden />}>
                {showArchived ? t("content.list.hideArchived") : t("content.list.showArchived")}
              </Button>
              {showArchived && <StatusSection status="archived" items={archived} />}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatusSection({ status, items }: { status: ContentStatus; items: ContentSummary[] }) {
  const { t } = useI18n();
  const titleId = `content-group-${status}`;
  return (
    <section aria-labelledby={titleId} data-testid={`content-group-${status}`}>
      <h3 id={titleId} className="text-base font-semibold text-ink">
        {t(`content.list.groups.${status}`)}
      </h3>
      <p className="mb-3 text-sm text-muted">{t(`content.list.groupHints.${status}`)}</p>
      <ul className="space-y-3">
        {groupByPack(items).map((g) =>
          g.packId ? (
            <li key={`pack-${g.packId}`}>
              <PackGroup packId={g.packId} items={g.items} />
            </li>
          ) : (
            <li key={g.items[0]!.id}>
              <ContentRow item={g.items[0]!} />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function PackGroup({ packId, items }: { packId: string; items: ContentSummary[] }) {
  const { t } = useI18n();
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-3" data-testid="pack-group">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <Package className="size-4 text-brand" aria-hidden />
          {t("content.types.pack")}
        </span>
        <Link to={paths.pack(packId)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand hover:underline">
          {t("content.list.openPack")}
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c.id}>
            <ContentRow item={c} compact />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContentRow({ item, compact }: { item: ContentSummary; compact?: boolean }) {
  const { t } = useI18n();
  const type = typeKey(item.content_type);
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-card shadow-[var(--shadow-card)] transition-colors hover:border-brand/40",
        compact ? "p-3" : "p-4",
      )}
      data-testid="content-row"
    >
      <TypeIcon type={type} />
      <Link to={paths.content(item.id)} className="min-w-0 flex-1 rounded-lg focus-visible:outline-offset-4">
        <span className="block truncate text-base font-semibold text-ink" dir="auto">
          {item.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>{t(`content.types.${type}`)}</span>
          {item.focus_area_title && (
            <span className="truncate" dir="auto">
              · {item.focus_area_title}
            </span>
          )}
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <ModeBadge mode={item.mode} />
          {item.shared_with_parent && <Badge tone="interest">{t("content.list.shared")}</Badge>}
          {item.last_feedback_result && <ResultBadge result={item.last_feedback_result} />}
        </span>
      </Link>
      {isUsable(item.status) && (
        <ButtonLink to={paths.presentContent(item.id)} variant="soft" icon={<Play className="size-4" aria-hidden />} aria-label={`${t("content.list.present")}: ${item.title}`}>
          <span className="hidden sm:inline">{t("content.list.present")}</span>
        </ButtonLink>
      )}
    </div>
  );
}

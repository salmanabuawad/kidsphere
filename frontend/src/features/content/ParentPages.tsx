/**
 * Parent views of shared content (read-only; PLAN-ADJUSTMENTS B14):
 *   /parent/children/:id/content  ParentChildContentPage — what the teacher shared
 *   /parent/content/:id           ParentContentPage — the child-friendly player
 * The API returns only content that is shared with parents AND approved or used,
 * without teacher notes or generation data; anything else is a 404 here.
 * features/parent/SharedContentPages.tsx re-exports these two pages.
 */
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { ContentIcon } from "@/icons";
import { Alert, Button, Card, CardBody, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { parseActivity, parseGame, parseStory, parseVideoPlan, PresentFrame, toContentLocale } from "@/features/player";
import { useI18n } from "@/i18n/I18nProvider";
import { isApiError } from "@/lib/api";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { contentListUrl, contentUrl, type ContentDetail, type ContentSummary } from "./api";
import { ContentPreview, playerBody } from "./ContentPreview";
import { TypeIcon, typeKey } from "./ui";

type ChildLike = { name?: unknown; preferred_name?: unknown };

function childName(data: unknown): string | null {
  const c = data && typeof data === "object" ? ((data as { child?: ChildLike }).child ?? (data as ChildLike)) : null;
  if (!c) return null;
  const preferred = typeof c.preferred_name === "string" ? c.preferred_name.trim() : "";
  if (preferred) return preferred;
  return typeof c.name === "string" && c.name.trim() ? c.name.trim() : null;
}

function listOf(data: unknown): ContentSummary[] {
  const raw = Array.isArray(data) ? data : data && typeof data === "object" ? (data as { content?: unknown; items?: unknown }).content ?? (data as { items?: unknown }).items : null;
  return Array.isArray(raw) ? raw.filter((c): c is ContentSummary => !!c && typeof c === "object" && typeof (c as ContentSummary).id === "string" && typeof (c as ContentSummary).title === "string") : [];
}

function itemOf(data: unknown): ContentDetail | null {
  const raw = data && typeof data === "object" && "content" in data ? (data as { content: unknown }).content : null;
  return raw && typeof raw === "object" && typeof (raw as ContentDetail).id === "string" && typeof (raw as ContentDetail).title === "string" ? (raw as ContentDetail) : null;
}

/** True when the player can show this item (the body matches its type). */
function renderable(item: ContentDetail): boolean {
  if (!item.content) return false;
  const body = playerBody(item);
  switch (item.content_type) {
    case "story":
      return parseStory(body) !== null;
    case "real_world_activity":
      return parseActivity(body) !== null;
    case "video":
      return parseVideoPlan(body) !== null;
    case "digital_game":
      return parseGame(body) !== null;
    default:
      return false;
  }
}

/** /parent/children/:id/content */
export function ParentChildContentPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const childReq = useFetch<unknown>(`/api/children/${encodeURIComponent(id)}`);
  const { data, error, loading, reload } = useFetch<unknown>(contentListUrl(id));
  const name = childName(childReq.data);
  const items = listOf(data);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ to: paths.parentHome(), label: t("content.parent.back") }}
        icon={<ContentIcon />}
        title={name ? t("content.parent.titleFor", { name }) : t("content.parent.title")}
        description={t("content.parent.subtitle")}
      />
      {error && !isApiError(error, "NOT_FOUND") ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && data === undefined && !error ? (
        <PageSkeleton />
      ) : items.length === 0 ? (
        <EmptyState scene="content" title={t("content.parent.empty")} description={t("content.parent.emptyHint")} />
      ) : (
        <ul className="space-y-3" data-testid="parent-content-list">
          {items.map((c) => {
            const type = typeKey(c.content_type);
            return (
              <li key={c.id}>
                <Link
                  to={paths.parentContent(c.id)}
                  className="ks-press flex min-h-20 items-center gap-4 rounded-lg border border-line bg-surface px-5 py-4 shadow-lip hover:-translate-y-px hover:shadow-lip-lg active:translate-y-0.5 active:shadow-none"
                >
                  <TypeIcon type={type} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-semibold text-ink" dir="auto">
                      {c.title}
                    </span>
                    <span className="block text-sm text-ink-muted">{t(`content.types.${type}`)}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-ink-muted rtl:-scale-x-100" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** /parent/content/:id */
export function ParentContentPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload } = useFetch<unknown>(contentUrl(id));
  const [full, setFull] = useState(false);
  const item = itemOf(data);

  if (loading && data === undefined && !error) return <PageSkeleton />;

  const backTo = item?.child_id ? paths.parentChildContent(item.child_id) : paths.parentHome();
  const backLabel = t("content.parent.back");

  if (error && !isApiError(error, "NOT_FOUND")) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ to: backTo, label: backLabel }} icon={<ContentIcon />} title={t("content.parent.title")} />
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ to: backTo, label: backLabel }} icon={<ContentIcon />} title={t("content.parent.title")} />
        <EmptyState scene="search" title={t("content.parent.notAvailable")} description={t("content.parent.notAvailableHint")} />
      </div>
    );
  }

  const type = typeKey(item.content_type);
  if (!renderable(item)) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ to: backTo, label: backLabel }} icon={<TypeIcon type={type} size="sm" />} eyebrow={t(`content.types.${type}`)} title={item.title} />
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">{t("content.parent.cantShow")}</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const playable = item.content_type === "story" || item.content_type === "digital_game";
  return (
    <div className="mx-auto max-w-4xl" data-testid="parent-content">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={backTo} className="-ms-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm text-ink-muted hover:text-ink">
          <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {backLabel}
        </Link>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <TypeIcon type={type} size="sm" />
            {t(`content.types.${type}`)}
          </span>
          {playable && (
            <Button variant="outline" onClick={() => setFull(true)} icon={<Maximize2 className="size-4" aria-hidden />}>
              {t("content.parent.fullScreen")}
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-line bg-surface p-4 sm:p-6">
        <ContentPreview item={item} audience="child" />
      </div>
      {full && (
        <PresentFrame lang={toContentLocale(item.language)} onExit={() => setFull(false)}>
          <ContentPreview item={item} audience="child" />
        </PresentFrame>
      )}
    </div>
  );
}

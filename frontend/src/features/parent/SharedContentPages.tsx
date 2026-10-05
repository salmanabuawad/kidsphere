/**
 * Simple placeholders for the parent's shared-activity pages. WP-11 owns the
 * real pages (content player, feedback); until then these list the titles
 * from GET /api/children/{id}/content and show one item's title, and a
 * missing endpoint (404) reads as "nothing shared yet".
 */
import { Link, useParams } from "react-router";
import { BookOpen, ChevronRight, Heart } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Spinner";
import { useI18n } from "@/i18n/I18nProvider";
import { isApiError } from "@/lib/api";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { childDisplayName, contentItem, parentChild, sharedContent } from "./types";

/** /parent/children/:id/content */
export function ParentChildContentPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { optionLabel } = useOptions();
  const childReq = useFetch<unknown>(`/api/children/${encodeURIComponent(id)}`);
  const { data, error, loading, reload } = useFetch<unknown>(`/api/children/${encodeURIComponent(id)}/content`);
  const child = parentChild(childReq.data);
  const name = child ? childDisplayName(child) : null;
  const items = sharedContent(data);
  const back = { to: paths.parentHome(), label: t("parent.home.title") };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={back}
        icon={<Heart />}
        title={name ? t("parent.shared.titleFor", { name }) : t("parent.shared.title")}
        description={t("parent.shared.subtitle")}
      />
      {error && !isApiError(error, "NOT_FOUND") ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && data === undefined && !error ? (
        <PageSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={<Heart />} title={t("parent.shared.empty")} description={t("parent.shared.emptyHint")} />
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                to={paths.parentContent(c.id)}
                className="flex min-h-16 items-center gap-4 rounded-[var(--radius-card)] border border-line bg-card px-5 py-4 shadow-[var(--shadow-card)] transition-colors hover:border-brand/40"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand" aria-hidden>
                  <BookOpen className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink" dir="auto">
                    {c.title}
                  </span>
                  {c.content_type && <span className="block text-sm text-muted">{optionLabel("content_types", c.content_type)}</span>}
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted rtl:rotate-180" aria-hidden />
              </Link>
            </li>
          ))}
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
  const { optionLabel } = useOptions();
  const { data, error, loading, reload } = useFetch<unknown>(`/api/content/${encodeURIComponent(id)}`);
  const item = contentItem(data);
  const back = { to: paths.parentHome(), label: t("parent.home.title") };

  if (loading && data === undefined && !error) return <PageSkeleton />;

  if (error && !isApiError(error, "NOT_FOUND")) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={back} icon={<BookOpen />} title={t("parent.shared.itemTitle")} />
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={back} icon={<BookOpen />} title={t("parent.shared.itemTitle")} />
        <EmptyState icon={<Heart />} title={t("parent.shared.notAvailable")} description={t("parent.shared.notAvailableHint")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={back}
        icon={<BookOpen />}
        eyebrow={item.content_type ? optionLabel("content_types", item.content_type) : undefined}
        title={<span dir="auto">{item.title}</span>}
      />
      <Card>
        <CardBody>
          <p className="text-sm text-muted">{t("parent.shared.itemSoon")}</p>
        </CardBody>
      </Card>
    </div>
  );
}

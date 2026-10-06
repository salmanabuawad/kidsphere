/**
 * "Earlier versions" (X-15): content is never overwritten. Every first draft, every new
 * version and every teacher edit is kept (GET /api/content/{id}/versions, newest first),
 * so the teacher can compare the AI draft with her own edits. A version opens read-only
 * in a dialog with the same players as the preview. Staff only; nothing shows when the
 * list cannot be loaded.
 */
import { useState } from "react";
import { History } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Dialog } from "@/components/ui";
import { ProvenanceBadge } from "@/components/source";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useFetch } from "@/lib/useFetch";
import { contentVersionsUrl, isGeneratedVersion, type ContentDetail, type ContentVersion, type ContentVersionsResponse } from "./api";
import { ContentPreview } from "./ContentPreview";

const VIA_KEYS: Record<string, string> = {
  generated: "content.review.versions.generated",
  regenerated: "content.review.versions.regenerated",
  edited: "content.review.versions.edited",
  manual: "content.review.versions.manual",
  system: "content.review.versions.earlier",
  backfill: "content.review.versions.earlier",
};

export function versionLabelKey(via?: string | null): string {
  return (via && VIA_KEYS[via]) || "content.review.versions.earlier";
}

/** The card; remount it (key) after a change so the list is fetched again. */
export function VersionHistory({ item }: { item: ContentDetail }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { data, error } = useFetch<ContentVersionsResponse>(contentVersionsUrl(item.id));
  const [open, setOpen] = useState<ContentVersion | null>(null);
  const list = data?.versions ?? [];
  if (error || !data) return null;
  const newest = list[0]?.seq;

  return (
    <Card data-testid="version-history">
      <CardHeader title={t("content.review.versions.title")} />
      <CardBody>
        {list.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("content.review.versions.none")}</p>
        ) : (
          <>
            <p className="mb-3 text-caption text-ink-muted">{t("content.review.versions.intro")}</p>
            <ol className="space-y-3">
              {list.map((v) => (
                <li key={v.id} className="space-y-1" data-testid="version-row" data-via={v.via}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{t(versionLabelKey(v.via))}</span>
                    {v.seq === newest && <Badge tone="neutral">{t("content.review.versions.current")}</Badge>}
                  </div>
                  {isGeneratedVersion(v.via) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <ProvenanceBadge kind="ai_suggested" />
                      <span className="text-caption text-ink-muted">
                        {t(v.data?.is_template === false ? "content.review.aiBadge" : "content.review.templateBadge")}
                      </span>
                    </div>
                  ) : null}
                  <p className="text-caption text-ink-muted">
                    {[v.changed_by_name ? t("content.review.versions.by", { name: v.changed_by_name }) : null, v.created_at ? formatDate(v.created_at) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {v.data?.title && (
                    <p className="text-sm text-ink" dir="auto">
                      {v.data.title}
                    </p>
                  )}
                  {v.data?.content && (
                    <Button size="sm" variant="ghost" onClick={() => setOpen(v)} icon={<History className="size-4" aria-hidden />}>
                      {t("content.review.versions.view")}
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </CardBody>
      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        size="xl"
        title={open ? t(versionLabelKey(open.via)) : ""}
        description={open?.created_at ? formatDate(open.created_at) : undefined}
        footer={
          <Button variant="ghost" onClick={() => setOpen(null)}>
            {t("common.close")}
          </Button>
        }
      >
        {open?.data?.content && (
          <div data-testid="version-preview">
            <ContentPreview item={{ ...item, title: open.data.title ?? item.title, content: open.data.content }} />
          </div>
        )}
      </Dialog>
    </Card>
  );
}

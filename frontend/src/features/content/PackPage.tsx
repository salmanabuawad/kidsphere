/**
 * /packs/:packId — a small pack (one goal): the story with its discussion
 * prompts, the teacher-led activity, the game (and a video plan when one was
 * requested), each with its status, a preview and a link to review it.
 * "Approve all drafts" approves the drafts one by one.
 */
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { PackIcon } from "@/icons";
import { Alert, Button, ButtonLink, Card, EmptyState, PageHeader, PageSkeleton, toast } from "@/components/ui";
import { childUrl, displayName, type ChildDetail } from "@/features/children";
import { useI18n } from "@/i18n/I18nProvider";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { approveContent, packUrl, type ContentDetail, type PackResponse } from "./api";
import { ContentPreview } from "./ContentPreview";
import { ModeBadge, SourceBadge, StatusChip, TypeIcon, typeKey } from "./ui";

export function PackPage() {
  const { packId = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload, setData } = useFetch<PackResponse>(packUrl(packId));
  const childReq = useFetch<{ child: ChildDetail }>(data?.child_id ? childUrl(data.child_id) : null);
  const { pending, run } = useAction();
  const name = childReq.data?.child ? displayName(childReq.data.child) : null;

  if (!data) {
    if (error)
      return error.status === 404 ? (
        <EmptyState scene="search" title={t("content.pack.notFound")} action={<ButtonLink to={paths.children()}>{t("children.child.backToList")}</ButtonLink>} />
      ) : (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      );
    return loading ? <PageSkeleton /> : null;
  }

  const drafts = data.items.filter((i) => i.status === "draft");
  const replace = (c: ContentDetail) => setData((d) => ({ ...d!, items: d!.items.map((i) => (i.id === c.id ? c : i)) }));

  async function approveAll() {
    for (const item of drafts) {
      const r = await run(() => approveContent(item.id), { onSuccess: (res) => replace(res.content) });
      if (!r.ok) return;
    }
    if (drafts.length) {
      toast(t("content.pack.approvedAll"));
      reload();
    }
  }

  const first = data.items[0];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={{ to: paths.childContent(data.child_id), label: t("content.review.back") }}
        icon={<PackIcon />}
        eyebrow={name ? t("content.review.forChild", { name }) : undefined}
        title={t("content.pack.title")}
        description={t("content.pack.subtitle")}
        actions={
          drafts.length > 0 ? (
            <Button size="lg" onClick={() => void approveAll()} loading={pending} icon={<Check className="size-5" aria-hidden />}>
              {t("content.pack.approveAll")}
            </Button>
          ) : undefined
        }
      />
      {first && (
        <div className="-mt-3 mb-5 flex flex-wrap gap-2">
          <ModeBadge mode={first.mode} />
          {first.focus_area_title && <span className="text-sm text-ink-muted" dir="auto">{first.focus_area_title}</span>}
          <SourceBadge isTemplate={first.is_template} />
        </div>
      )}
      <ol className="space-y-4">
        {data.items.map((item) => (
          <li key={item.id}>
            <PackItem item={item} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function PackItem({ item }: { item: ContentDetail }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(item.content_type === "story");
  const type = typeKey(item.content_type);
  const goal = typeof item.content?.goal === "string" ? item.content.goal : typeof item.content?.learning_goal === "string" ? item.content.learning_goal : null;
  return (
    <Card data-testid="pack-item">
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <TypeIcon type={type} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-muted">{t(`content.types.${type}`)}</p>
          <Link to={paths.content(item.id)} className="block text-lg font-semibold text-ink hover:underline" dir="auto">
            {item.title}
          </Link>
          {goal && (
            <p className="mt-1 text-sm text-ink-muted" dir="auto">
              {goal}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={item.status} />
          <ButtonLink to={paths.content(item.id)} variant="outline" size="sm" icon={<ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />}>
            {t("content.pack.open")}
          </ButtonLink>
        </div>
      </div>
      <div className="border-t border-line px-4 py-2 sm:px-5">
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)} icon={<ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90 rtl:rotate-90")} aria-hidden />}>
          {open ? t("content.pack.hidePreview") : t("content.pack.showPreview")}
        </Button>
        {open && (
          <div className="mt-2 mb-3 rounded-[var(--radius-card)] bg-tray p-3 sm:p-4">
            <ContentPreview item={item} />
          </div>
        )}
      </div>
    </Card>
  );
}

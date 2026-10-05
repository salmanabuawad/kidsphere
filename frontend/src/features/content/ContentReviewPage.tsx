/**
 * /content/:id — review a draft and use approved content (spec §19–20).
 * Preview with the real player, a structured editor, Approve, New version
 * (regenerate), Duplicate, Share with parents, Archive, Delete (drafts), and
 * for approved/completed content: Present and "How did it go?".
 * ?feedback=1 (used when leaving Present) opens the feedback dialog.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Archive, Check, Copy, MessageCircleHeart, Pencil, RefreshCw, Share2, Trash2 } from "lucide-react";
import { PackIcon, PresentIcon } from "@/icons";
import { Alert, Badge, Button, ButtonLink, Card, CardBody, CardHeader, Dialog, EmptyState, Field, PageHeader, PageSkeleton, Tabs, Textarea } from "@/components/ui";
import { childUrl, displayName, type ChildDetail } from "@/features/children";
import { LOCALE_NAMES, isLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import {
  approveContent,
  archiveContent,
  canDelete,
  canEdit,
  canShare,
  contentUrl,
  deleteContent,
  duplicateContent,
  isUsable,
  regenerateContent,
  shareContent,
  type ContentDetail,
  type ContentResponse,
  type FeedbackResult,
} from "./api";
import { ContentEditor } from "./ContentEditor";
import { ContentPreview } from "./ContentPreview";
import { FeedbackDialog } from "./FeedbackDialog";
import { ModeBadge, ResultBadge, SourceBadge, StatusChip, TYPE_ICONS, typeKey } from "./ui";

export function ContentReviewPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload, setData } = useFetch<ContentResponse>(contentUrl(id));
  const item = data?.content;

  if (!item) {
    if (error)
      return error.status === 404 ? (
        <EmptyState scene="search" title={t("content.review.notFound")} action={<ButtonLink to={paths.children()}>{t("children.child.backToList")}</ButtonLink>} />
      ) : (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      );
    return loading ? <PageSkeleton /> : null;
  }
  return <Review key={item.id} item={item} onChange={(c) => setData({ content: c })} />;
}

function Review({ item, onChange }: { item: ContentDetail; onChange: (c: ContentDetail) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const childReq = useFetch<{ child: ChildDetail }>(item.child_id ? childUrl(item.child_id) : null);
  const childName = childReq.data?.child ? displayName(childReq.data.child) : null;
  const editable = canEdit(item.status);
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "regenerate" | "archive" | "delete">(null);
  const action = useAction();
  const type = typeKey(item.content_type);
  const Icon = TYPE_ICONS[type];
  const back = item.child_id ? paths.childContent(item.child_id) : paths.children();

  // Leaving Present comes back with ?feedback=1: ask "How did it go?" right away.
  useEffect(() => {
    if (params.get("feedback") === "1") {
      if (isUsable(item.status)) setFeedbackOpen(true);
      const next = new URLSearchParams(params);
      next.delete("feedback");
      setParams(next, { replace: true });
    }
  }, [params, setParams, item.status]);

  useEffect(() => {
    if (!editable) setTab("preview");
  }, [editable]);

  const approve = () => action.run(() => approveContent(item.id), { success: t("content.review.approved"), onSuccess: (r) => onChange(r.content) });
  const toggleShare = () =>
    action.run(() => shareContent(item.id, !item.shared_with_parent), {
      success: item.shared_with_parent ? t("content.review.unsharedToast") : t("content.review.sharedToast"),
      onSuccess: (r) => onChange(r.content),
    });
  const duplicate = () =>
    action.run(() => duplicateContent(item.id), { success: t("content.review.duplicated"), onSuccess: (r) => navigate(paths.content(r.content.id)) });

  const status = item.status ?? "draft";
  const note =
    status === "draft" ? t("content.review.draftNote") : status === "completed" ? t("content.review.completedNote") : status === "archived" ? t("content.review.archivedNote") : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ to: back, label: t("content.review.back") }}
        icon={<Icon />}
        eyebrow={
          <span>
            {t(`content.types.${type}`)}
            {childName && <> · {t("content.review.forChild", { name: childName })}</>}
          </span>
        }
        title={item.title}
      />

      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2">
        <StatusChip status={status} />
        <ModeBadge mode={item.mode} />
        <SourceBadge isTemplate={item.is_template} />
        {item.shared_with_parent && <Badge tone="neutral">{t("content.review.shared")}</Badge>}
        {item.pack_id && (
          <Link to={paths.pack(item.pack_id)} className="inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-sm font-semibold text-brand hover:underline">
            <PackIcon className="size-4" paint={false} aria-hidden />
            {t("content.review.openPack")}
          </Link>
        )}
      </div>

      {note && (
        <Alert tone={status === "draft" ? "tip" : "info"} className="mb-5">
          {note}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {editable && (
            <Tabs
              label={item.title}
              value={tab}
              onChange={(k) => setTab(k as "preview" | "edit")}
              tabs={[
                { key: "preview", label: t("content.review.preview") },
                { key: "edit", label: t("content.review.edit"), icon: <Pencil className="size-4" aria-hidden /> },
              ]}
            />
          )}
          {tab === "edit" && editable ? (
            <ContentEditor
              item={item}
              onCancel={() => setTab("preview")}
              onSaved={(c) => {
                onChange(c);
                setTab("preview");
              }}
            />
          ) : (
            <div className="rounded-[var(--radius-card)] border border-line bg-tray p-3 sm:p-5" data-testid="content-preview">
              <ContentPreview item={item} />
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-2">
              {status === "draft" && (
                <Button size="lg" className="w-full" onClick={() => void approve()} loading={action.pending} icon={<Check className="size-5" aria-hidden />}>
                  {t("content.review.approve")}
                </Button>
              )}
              {isUsable(status) && (
                <>
                  <ButtonLink size="lg" className="w-full" to={paths.presentContent(item.id)} icon={<PresentIcon paint={false} aria-hidden />}>
                    {t("content.review.present")}
                  </ButtonLink>
                  <Button size="lg" variant="soft" className="w-full" onClick={() => setFeedbackOpen(true)} icon={<MessageCircleHeart className="size-5" aria-hidden />}>
                    {t("content.review.feedback")}
                  </Button>
                </>
              )}
              {status !== "archived" && (
                <Button
                  variant="outline"
                  className="w-full"
                  aria-pressed={!!item.shared_with_parent}
                  disabled={!canShare(status) || action.pending}
                  onClick={() => void toggleShare()}
                  icon={item.shared_with_parent ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
                >
                  {item.shared_with_parent ? t("content.review.shared") : t("content.review.share")}
                </Button>
              )}
              {!canShare(status) && status === "draft" && <p className="text-caption text-ink-muted">{t("content.review.shareNeedsApproval")}</p>}
              <div className="grid grid-cols-1 gap-2 pt-2">
                {editable && (
                  <>
                    <Button variant="ghost" className="justify-start" onClick={() => setTab("edit")} icon={<Pencil className="size-4" aria-hidden />}>
                      {t("content.review.edit")}
                    </Button>
                    <Button variant="ghost" className="justify-start" onClick={() => setDialog("regenerate")} icon={<RefreshCw className="size-4" aria-hidden />}>
                      {t("content.review.regenerate")}
                    </Button>
                  </>
                )}
                <Button variant="ghost" className="justify-start" onClick={() => void duplicate()} disabled={action.pending} icon={<Copy className="size-4" aria-hidden />}>
                  {t("content.review.duplicate")}
                </Button>
                {status !== "archived" && (
                  <Button variant="ghost" className="justify-start" onClick={() => setDialog("archive")} icon={<Archive className="size-4" aria-hidden />}>
                    {t("content.review.archive")}
                  </Button>
                )}
                {canDelete(status) && (
                  <Button variant="ghost" className="justify-start text-danger" onClick={() => setDialog("delete")} icon={<Trash2 className="size-4" aria-hidden />}>
                    {t("content.review.delete")}
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
          <WhyCard item={item} />
          <FeedbackHistory item={item} />
        </aside>
      </div>

      <FeedbackDialog item={item} open={feedbackOpen} onClose={() => setFeedbackOpen(false)} onSaved={onChange} />
      <RegenerateDialog
        item={item}
        open={dialog === "regenerate"}
        onClose={() => setDialog(null)}
        onDone={(c) => {
          onChange(c);
          setTab("preview");
        }}
      />
      <ConfirmDialog
        open={dialog === "archive"}
        title={t("content.review.archive")}
        body={t("content.review.archiveConfirm")}
        confirm={t("content.review.archive")}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          action.run(() => archiveContent(item.id), {
            success: t("content.review.archivedToast"),
            onSuccess: (r) => {
              setDialog(null);
              onChange(r.content);
            },
          })
        }
        pending={action.pending}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title={t("content.review.delete")}
        body={t("content.review.deleteConfirm")}
        confirm={t("content.review.delete")}
        danger
        onClose={() => setDialog(null)}
        onConfirm={() =>
          action.run(() => deleteContent(item.id), {
            success: t("content.review.deleted"),
            onSuccess: () => navigate(back, { replace: true }),
          })
        }
        pending={action.pending}
      />
    </div>
  );
}

function RegenerateDialog({ item, open, onClose, onDone }: { item: ContentDetail; open: boolean; onClose: () => void; onDone: (c: ContentDetail) => void }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [instruction, setInstruction] = useState("");
  async function go() {
    const r = await run(() => regenerateContent(item.id, instruction.trim() || undefined), { success: t("content.review.regenerated") });
    if (r.ok) {
      setInstruction("");
      onDone(r.data.content);
      onClose();
    }
  }
  return (
    <Dialog
      open={open}
      onClose={() => !pending && onClose()}
      title={t("content.review.regenerateTitle")}
      description={item.status === "approved" ? t("content.review.regenerateBackToDraft") : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void go()} loading={pending} icon={<RefreshCw className="size-4" aria-hidden />}>
            {t("content.review.regenerateConfirm")}
          </Button>
        </>
      }
    >
      <Field label={`${t("content.review.regenerateHint")} (${t("common.optional")})`} hint={pending ? t("content.create.generatingHint") : undefined}>
        {(p) => (
          <Textarea {...p} rows={3} maxLength={500} value={instruction} placeholder={t("content.review.regeneratePlaceholder")} onChange={(e) => setInstruction(e.target.value)} />
        )}
      </Field>
    </Dialog>
  );
}

function ConfirmDialog({
  open,
  title,
  body,
  confirm,
  danger,
  onClose,
  onConfirm,
  pending,
}: {
  open: boolean;
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={pending}>
            {confirm}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink">{body}</p>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-caption font-medium text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink" dir="auto">
        {children}
      </dd>
    </div>
  );
}

/** "Why this content": what the content was built from (the allow-listed AI input). */
function WhyCard({ item }: { item: ContentDetail }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const gi = item.generation_input;
  if (!gi) return null;
  const labels = (xs?: { label: string }[]) => (xs ?? []).map((x) => x.label).join(" · ");
  const focus = item.focus_area_title || gi.focus?.title;
  const lang = item.language && isLocale(item.language) ? LOCALE_NAMES[item.language] : null;
  const target = gi.target_strength;
  const strengthLabel = (key: string | null | undefined, fallback: string) => {
    if (!key) return fallback;
    for (const list of ["strength_targets", "strengths"]) {
      const l = optionLabel(list, key);
      if (l !== key) return l;
    }
    return fallback;
  };
  return (
    <Card data-testid="why-card">
      <CardHeader title={t("content.review.why")} />
      <CardBody>
        <dl className="space-y-3">
          {item.mode && <Row label={t("content.review.whyGoal")}>{t(`content.modes.${item.mode}`)}</Row>}
          {focus && <Row label={t("content.review.whyFocus")}>{focus}</Row>}
          {target && <Row label={t("content.review.whyStrength")}>{strengthLabel(target.key, target.label)}</Row>}
          {gi.strengths && gi.strengths.length > 0 && <Row label={t("content.review.whyStrengths")}>{labels(gi.strengths)}</Row>}
          {gi.interests && gi.interests.length > 0 && <Row label={t("content.review.whyInterests")}>{labels(gi.interests)}</Row>}
          {lang && <Row label={t("content.review.whyLanguage")}>{lang}</Row>}
          {gi.instruction && <Row label={t("content.review.whyInstruction")}>{gi.instruction}</Row>}
          {typeof item.variant === "number" && item.variant > 0 && <Row label={t("content.review.versionLabel")}>{t("content.review.version", { n: item.variant + 1 })}</Row>}
        </dl>
      </CardBody>
    </Card>
  );
}

function FeedbackHistory({ item }: { item: ContentDetail }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const { optionLabel } = useOptions();
  const list = item.feedback ?? [];
  if (!isUsable(item.status) && list.length === 0) return null;
  return (
    <Card data-testid="feedback-history">
      <CardHeader title={t("content.review.feedbackHistory")} />
      <CardBody>
        {list.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("content.review.noFeedback")}</p>
        ) : (
          <ul className="space-y-4">
            {list.map((f) => (
              <li key={f.id} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <ResultBadge result={f.result as FeedbackResult} />
                  {f.support_level && f.support_level !== "not_observed" && (
                    <span className="text-caption text-ink-muted">{t("content.review.supportLine", { level: t(`content.support.${f.support_level}`) })}</span>
                  )}
                </div>
                {f.observation && (
                  <p className="text-sm text-ink" dir="auto">
                    {f.observation}
                  </p>
                )}
                {f.what_helped && f.what_helped.length > 0 && (
                  <p className="text-caption text-ink-muted" dir="auto">
                    {t("content.review.helpedLine", {
                      items: f.what_helped.map((h) => (h.key ? optionLabel("what_helps", h.key) : (h.custom ?? ""))).join(" · "),
                    })}
                  </p>
                )}
                <p className="text-caption text-ink-muted">{[f.by_name, formatDate(f.created_at)].filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}


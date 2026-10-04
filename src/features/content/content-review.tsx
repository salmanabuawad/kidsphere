"use client";

import type { ContentStatus, ContentType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, BookmarkPlus, CheckCircle2, Eye, Pencil, RefreshCw, Send, UploadCloud, X } from "lucide-react";
import type { ContentBody, Rationale } from "@/lib/ai/schemas";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { LOCALE_NAMES, type AppLocale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";
import { anyVocabLabel } from "@/features/child-understanding/vocabulary";
import { ContentPlayer } from "@/features/player/content-player";
import { RecordOutcomeButton } from "@/features/goals/record-outcome";
import { STATUS_TONE } from "./status";
import { BodyEditor } from "./body-editor";
import { NarrationRecorder } from "./narration-recorder";

export type ReviewData = {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  language: AppLocale;
  revision: number;
  isDemoGenerated: boolean;
  body: ContentBody;
  rationale: Rationale | null;
  goal: { id: string; statement: string; status: string } | null;
  child: { id: string; displayName: string } | null;
  characters: { mediaAssetId: string; label: string; usable: boolean }[];
  narrations: { id: string; sceneId: string | null; approved: boolean }[];
  versions: { id: string; versionNumber: number; source: string; createdAt: string }[];
  approvals: { id: string; action: string; createdAt: string; note: string | null }[];
  canRegenerate: boolean;
};

export function ContentReview({ data }: { data: ReviewData }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { pending, run } = useAction();
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [draft, setDraft] = useState<ContentBody>(data.body);
  const [regenOpen, setRegenOpen] = useState(false);
  const base = `/api/content/${data.id}`;
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.body);
  const characterIssue = data.characters.some((c) => !c.usable);

  const notice = {
    DRAFT: ["warning", t("teacher.content.draftNotice")],
    TEACHER_REVIEW: ["warning", t("teacher.content.draftNotice")],
    APPROVED: ["info", t("teacher.content.approvedNotice")],
    PUBLISHED: ["success", t("teacher.content.publishedNotice")],
    ARCHIVED: ["info", t("teacher.content.archivedNotice")],
  } as const;

  async function save() {
    const ok = await run(() => api(base, { method: "PATCH", body: { revision: data.revision, body: draft } }), { success: t("teacher.content.editsSaved") });
    if (ok) setMode("preview");
  }

  const regen = (body: Record<string, unknown>) =>
    run(() => api(`${base}/regenerate`, { body: { revision: data.revision, ...body } }), { success: t("teacher.content.regenerated") }).then((r) => {
      if (r) setRegenOpen(false);
    });

  const scenes =
    data.body.kind === "story"
      ? data.body.scenes.map((s, i) => ({ id: s.id, label: t("teacher.content.scene", { n: i + 1 }) }))
      : data.body.kind === "routine"
        ? data.body.steps.map((s, i) => ({ id: s.id, label: t("teacher.content.step", { n: i + 1 }) }))
        : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[data.status]}>
          <span data-testid="content-status">{t(`enums.contentStatus.${data.status}`)}</span>
        </Badge>
        <Badge>{t(`enums.contentType.${data.type}`)}</Badge>
        <Badge tone="stone">{LOCALE_NAMES[data.language]}</Badge>
        {data.isDemoGenerated && (
          <span title={t("common.demoHint")}>
            <Badge tone="violet">{t("common.demo")}</Badge>
          </span>
        )}
        {data.child && <span className="text-muted text-sm">{t("teacher.content.forChild", { name: data.child.displayName })}</span>}
      </div>

      <Alert tone={notice[data.status][0]}>{notice[data.status][1]}</Alert>
      {characterIssue && <Alert tone="warning">{t("teacher.content.characterRevoked")}</Alert>}

      <div className="flex flex-wrap gap-2" role="toolbar">
        {(data.status === "DRAFT" || data.status === "TEACHER_REVIEW") && (
          <Button
            onClick={() => run(() => api(`${base}/approve`, { body: { revision: data.revision } }), { success: t("teacher.content.approved") })}
            loading={pending}
            disabled={dirty}
            data-testid="approve"
          >
            <CheckCircle2 className="size-4" />
            {t("teacher.content.approve")}
          </Button>
        )}
        {data.status === "DRAFT" && (
          <Button variant="outline" onClick={() => run(() => api(`${base}/submit`, { method: "POST" }))} disabled={pending}>
            <Send className="size-4" />
            {t("teacher.content.submitReview")}
          </Button>
        )}
        {data.status !== "ARCHIVED" && data.status !== "PUBLISHED" && (
          <Button
            variant={data.status === "APPROVED" ? "primary" : "outline"}
            onClick={() => run(() => api(`${base}/publish`, { body: {} }), { success: t("teacher.content.published") })}
            disabled={pending}
            data-testid="publish"
          >
            <UploadCloud className="size-4" />
            {t("teacher.content.publish")}
          </Button>
        )}
        <ButtonLink href={`/teacher/content/${data.id}/preview`} variant="outline">
          <Eye className="size-4" />
          {t("teacher.content.previewChild")}
        </ButtonLink>
        {data.goal && data.child && <RecordOutcomeButton goalId={data.goal.id} contentId={data.id} variant="outline" size="md" />}
        {data.status !== "ARCHIVED" && (
          <Button variant="ghost" onClick={() => run(() => api(`${base}/archive`, { method: "POST" }))} disabled={pending}>
            <Archive className="size-4" />
            {t("teacher.content.archive")}
          </Button>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <div className="border-line flex items-center justify-between border-b px-4 py-2">
            <div className="flex gap-1">
              {(["preview", "edit"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  data-testid={`mode-${m}`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm",
                    mode === m ? "bg-stone-100 font-medium" : "text-muted hover:text-ink",
                  )}
                >
                  {m === "preview" ? <Eye className="size-4" /> : <Pencil className="size-4" />}
                  {m === "preview" ? t("common.preview") : t("teacher.content.editor")}
                </button>
              ))}
            </div>
            {data.canRegenerate && data.status !== "ARCHIVED" && (
              <Button size="sm" variant="ghost" onClick={() => setRegenOpen(true)}>
                <RefreshCw className="size-4" />
                {t("teacher.content.regenerate")}
              </Button>
            )}
          </div>
          <CardBody className="bg-gradient-to-b from-white to-amber-50/40">
            {mode === "preview" ? (
              <ContentPlayer
                key={JSON.stringify(data.body).length + data.revision}
                body={data.body}
                narrations={data.narrations.map((n) => ({ sceneId: n.sceneId, url: `/api/narrations/${n.id}/audio` }))}
              />
            ) : (
              <div className="space-y-4">
                <BodyEditor body={draft} onChange={setDraft} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setDraft(data.body)} disabled={!dirty}>
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={save} disabled={!dirty} loading={pending} data-testid="save-edits">
                    {t("teacher.content.saveEdits")}
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          {data.rationale && (
            <Card>
              <CardHeader title={t("teacher.content.rationale")} />
              <CardBody className="space-y-3 text-sm" data-testid="rationale">
                <div>
                  <p className="text-muted text-xs tracking-wide uppercase">{t("teacher.content.goalUsed")}</p>
                  <p>{data.goal?.statement ?? data.rationale.goalUsed}</p>
                </div>
                {(
                  [
                    ["interestsUsed", data.rationale.interestsUsed],
                    ["strengthsUsed", data.rationale.strengthsUsed],
                    ["supportsUsed", data.rationale.supportsUsed],
                    ["avoided", data.rationale.avoided],
                  ] as const
                ).map(([key, list]) => (
                  <div key={key}>
                    <p className="text-muted text-xs tracking-wide uppercase">{t(`teacher.content.${key}`)}</p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {list.length === 0 ? <span className="text-muted">—</span> : list.map((k) => <Badge key={k}>{anyVocabLabel(k, locale)}</Badge>)}
                    </p>
                  </div>
                ))}
                <div>
                  <p className="text-muted text-xs tracking-wide uppercase">{t("teacher.content.explanation")}</p>
                  <p className="text-stone-700" dir="auto">
                    {data.rationale.explanation}
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          {data.characters.length > 0 && (
            <Card>
              <CardHeader title={t("teacher.studio.characters")} />
              <CardBody className="space-y-2">
                {data.characters.map((c) => (
                  <div key={c.mediaAssetId} className="flex items-center gap-2 text-sm">
                    <span className={cn("flex-1", !c.usable && "text-amber-700 line-through")}>{c.label}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(() => api(base, { method: "PATCH", body: { revision: data.revision, removeCharacterIds: [c.mediaAssetId] } }))}
                    >
                      <X className="size-4" />
                      {t("teacher.content.removeCharacter")}
                    </Button>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {data.body.kind !== "guide" && data.body.kind !== "activity" && (
            <Card>
              <CardHeader title={t("teacher.content.narrationTitle")} />
              <CardBody>
                <NarrationRecorder contentId={data.id} scenes={scenes} narrations={data.narrations} />
              </CardBody>
            </Card>
          )}

          {data.body.optionalHomeActivity && (
            <Card>
              <CardHeader title={t("teacher.content.homeActivity")} />
              <CardBody className="text-sm" dir="auto">
                <p className="font-medium">{data.body.optionalHomeActivity.title}</p>
                <p className="text-stone-600">{data.body.optionalHomeActivity.instructions}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={t("teacher.content.history")} />
            <CardBody>
              <ul className="space-y-2 text-sm">
                {[
                  ...data.versions.map((v) => ({
                    key: v.id,
                    at: v.createdAt,
                    label: `${t("teacher.content.version", { n: v.versionNumber })} · ${t(`teacher.content.versionSource.${v.source}` as MessageKey)}`,
                  })),
                  ...data.approvals.map((a) => ({ key: a.id, at: a.createdAt, label: t(`teacher.content.approvalAction.${a.action}` as MessageKey) })),
                ]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((e) => (
                    <li key={e.key} className="flex justify-between gap-2">
                      <span>{e.label}</span>
                      <span className="text-muted shrink-0 text-xs">{formatDateTime(e.at, locale)}</span>
                    </li>
                  ))}
              </ul>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3"
                onClick={async () => {
                  await run(() => api(`${base}/template`, { method: "POST" }), { success: t("teacher.content.templateSaved"), refresh: false });
                  router.refresh();
                }}
              >
                <BookmarkPlus className="size-4" />
                {t("teacher.content.saveTemplate")}
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      <RegenerateDialog open={regenOpen} onClose={() => setRegenOpen(false)} data={data} pending={pending} onRegenerate={regen} />
    </div>
  );
}

function RegenerateDialog({
  open,
  onClose,
  data,
  pending,
  onRegenerate,
}: {
  open: boolean;
  onClose: () => void;
  data: ReviewData;
  pending: boolean;
  onRegenerate: (b: Record<string, unknown>) => void;
}) {
  const { t, locale } = useI18n();
  const [sceneId, setSceneId] = useState(data.body.kind === "story" ? (data.body.scenes[0]?.id ?? "") : "");
  const [language, setLanguage] = useState<AppLocale>(data.language === "ar" ? "en" : "ar");
  const [theme, setTheme] = useState("");
  const keys = data.rationale ? [...data.rationale.interestsUsed, ...data.rationale.strengthsUsed, ...data.rationale.supportsUsed] : [];
  const [remove, setRemove] = useState(keys[0] ?? "");

  const row = (label: string, control: React.ReactNode, action: () => void, testId?: string) => (
    <div className="border-line flex flex-wrap items-center gap-2 border-b py-3 last:border-0">
      <span className="min-w-40 flex-1 text-sm font-medium">{label}</span>
      {control}
      <Button size="sm" variant="outline" onClick={action} disabled={pending} data-testid={testId}>
        <RefreshCw className="size-4" />
        {t("teacher.content.regenerate")}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onClose={onClose} title={t("teacher.content.regenerate")} size="lg" closeLabel={t("common.close")}>
      <div>
        {row(t("teacher.content.regenerateAll"), null, () => onRegenerate({ mode: "full" }), "regen-full")}
        {data.body.kind === "story" &&
          row(
            t("teacher.content.regenerateScene"),
            <Select className="w-auto" value={sceneId} onChange={(e) => setSceneId(e.target.value)} aria-label={t("teacher.content.regenerateScene")}>
              {data.body.scenes.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {t("teacher.content.scene", { n: i + 1 })}
                </option>
              ))}
            </Select>,
            () => onRegenerate({ mode: "scene", sceneId }),
          )}
        {row(t("teacher.content.simplify"), null, () => onRegenerate({ mode: "simplify" }))}
        {row(t("teacher.content.harder"), null, () => onRegenerate({ mode: "harder" }))}
        {row(
          t("teacher.content.changeLanguage"),
          <Select
            className="w-auto"
            value={language}
            onChange={(e) => setLanguage(e.target.value as AppLocale)}
            aria-label={t("teacher.content.changeLanguage")}
          >
            {(["ar", "he", "en"] as AppLocale[]).map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </Select>,
          () => onRegenerate({ mode: "language", language }),
        )}
        {row(
          t("teacher.content.changeTheme"),
          <Input
            className="w-40"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder={t("teacher.studio.themePlaceholder")}
            aria-label={t("teacher.content.changeTheme")}
          />,
          () => onRegenerate({ mode: "theme", theme: theme || null }),
        )}
        {keys.length > 0 &&
          row(
            t("teacher.content.removePersonalization"),
            <Select className="w-auto" value={remove} onChange={(e) => setRemove(e.target.value)} aria-label={t("teacher.content.removePersonalization")}>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {anyVocabLabel(k, locale)}
                </option>
              ))}
            </Select>,
            () => onRegenerate({ mode: "remove_personalization", removeKeys: [remove] }),
          )}
      </div>
    </Dialog>
  );
}

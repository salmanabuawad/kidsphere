import { useState, type ReactNode } from "react";
import { BadgeCheck, FileText, Pencil, Plus, Sparkles, X } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Chip, Dialog, EmptyState, Field, IconButton, Input, Select, Skeleton, Textarea, toast } from "@/components/ui";
import { ProvenanceBadges } from "@/components/source";
import { useI18n } from "@/i18n/I18nProvider";
import { isApiError } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import {
  approveSummary,
  saveSummary,
  suggestSummary,
  summariesUrl,
  type FunctionalSummary,
  type SummariesResponse,
  type SummaryFields,
  type SummaryInput,
  type SummaryItem,
} from "./api";

type TextField = "general_description" | "adaptations" | "follow_up_with_parents" | "team_recommendations";
const LIMITS: Record<TextField, number> = { general_description: 4000, adaptations: 2000, follow_up_with_parents: 1000, team_recommendations: 1000 };

/** What the editor holds; the source (manual / AI draft) and the version it replaces travel with it. */
export type SummaryDraft = {
  general_description: string;
  strengths: SummaryItem[];
  strengthsText: string;
  needs: string[];
  needsText: string;
  adaptations: string;
  follow_up_with_parents: string;
  team_recommendations: string;
  source: "manual" | "ai_draft";
  aiSuggestionId?: string;
  supersedesId?: string;
  /** The AI draft, kept for "Compare with the AI draft". */
  ai?: SummaryFields;
};

export function draftFrom(s: SummaryFields | null, extra: Partial<SummaryDraft> = {}): SummaryDraft {
  return {
    general_description: s?.general_description ?? "",
    strengths: [...(s?.main_strengths?.items ?? [])],
    strengthsText: s?.main_strengths?.text ?? "",
    needs: [...(s?.main_needs?.items ?? [])],
    needsText: s?.main_needs?.text ?? "",
    adaptations: s?.adaptations ?? "",
    follow_up_with_parents: s?.follow_up_with_parents ?? "",
    team_recommendations: s?.team_recommendations ?? "",
    source: "manual",
    ...extra,
  };
}

/** The POST body for a new summary row. */
export function summaryPayload(d: SummaryDraft): SummaryInput {
  const s = (v: string) => v.trim() || null;
  return {
    general_description: s(d.general_description),
    main_strengths: { items: d.strengths, text: s(d.strengthsText) },
    main_needs: { items: d.needs.map((n) => n.trim()).filter(Boolean), text: s(d.needsText) },
    adaptations: s(d.adaptations),
    follow_up_with_parents: s(d.follow_up_with_parents),
    team_recommendations: s(d.team_recommendations),
    source: d.source,
    ...(d.aiSuggestionId ? { ai_suggestion_id: d.aiSuggestionId } : {}),
    ...(d.supersedesId ? { supersedes_id: d.supersedesId } : {}),
  };
}

const isEmpty = (d: SummaryDraft) =>
  ![d.general_description, d.strengthsText, d.needsText, d.adaptations, d.follow_up_with_parents, d.team_recommendations].some((v) => v.trim()) &&
  !d.strengths.length &&
  !d.needs.some((n) => n.trim());

/**
 * The short functional summary (Domain 17, X-25): Write, or Draft with AI (AI SUGGESTED) → edit →
 * Approve (TEACHER APPROVED). Every save is a new version; the history keeps them all.
 */
export function SummaryCard({ childId }: { childId: string }) {
  const { t, locale } = useI18n();
  const { formatDate } = useFormat();
  const toMessage = useErrorMessage();
  const { data, error, reload } = useFetch<SummariesResponse>(summariesUrl(childId));
  const suggesting = useAction();
  const approving = useAction();
  const [editing, setEditing] = useState<SummaryDraft | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const approved = data?.latest_approved ?? null;
  const draft = data?.drafts[0] ?? null;
  const base = draft ?? approved;

  function write() {
    const aiFor = base?.ai_suggestion_id ? data?.ai_drafts[base.ai_suggestion_id] : undefined;
    setEditing(
      draftFrom(base, {
        supersedesId: base?.id,
        source: base?.source ?? "manual",
        aiSuggestionId: base?.ai_suggestion_id ?? undefined,
        ai: aiFor,
      }),
    );
  }

  async function draftWithAi() {
    const r = await suggesting.run(() => suggestSummary(childId, locale));
    if (r.ok) setEditing(draftFrom(r.data.draft, { source: "ai_draft", aiSuggestionId: r.data.suggestion_id, supersedesId: base?.id, ai: r.data.draft }));
  }

  async function approve(s: FunctionalSummary) {
    const r = await approving.run(() => approveSummary(s.id), { success: t("development.summary.toasts.approved") });
    if (r.ok || isApiError(r.error, "SUMMARY_APPROVED")) reload();
  }

  return (
    <Card data-testid="summary-card">
      <CardHeader
        title={t("development.summary.title")}
        description={t("development.summary.intro")}
        icon={<FileText className="size-4" aria-hidden />}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<Pencil className="size-4" aria-hidden />} disabled={!data} onClick={write}>
              {base ? t("development.summary.edit") : t("development.summary.write")}
            </Button>
            <Button size="sm" variant="soft" icon={<Sparkles className="size-4" aria-hidden />} loading={suggesting.pending} disabled={!data} onClick={draftWithAi}>
              {t("development.summary.draftWithAi")}
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-5">
        {error && !data ? (
          <Alert tone="error">{toMessage(error)}</Alert>
        ) : !data ? (
          <Skeleton className="h-32" />
        ) : !approved && !draft ? (
          <EmptyState title={t("development.summary.none")} description={t("development.summary.noneHint")} />
        ) : (
          <>
            {draft && (
              <section className="space-y-3 rounded-md border border-line p-4" data-testid="summary-draft">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {t("development.summary.pendingDraft")}
                    <Badge tone="muted">{t("development.summary.draft")}</Badge>
                    <ProvenanceBadges kinds={draft.provenance} />
                  </p>
                  <Button size="sm" icon={<BadgeCheck className="size-4" aria-hidden />} loading={approving.pending} onClick={() => approve(draft)}>
                    {t("development.summary.approve")}
                  </Button>
                </div>
                {draft.created_by?.name && (
                  <p className="text-caption text-ink-muted">{t("development.summary.draftBy", { name: draft.created_by.name, date: formatDate(draft.created_at) })}</p>
                )}
                <SummaryView summary={draft} />
              </section>
            )}
            {approved && (
              <section className="space-y-3" data-testid="summary-approved">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  {t("development.summary.latestApproved")}
                  <ProvenanceBadges kinds={approved.provenance} />
                  {approved.source === "ai_draft" && <span className="text-caption font-normal text-ink-muted">{t("development.summary.fromAi")}</span>}
                </p>
                {approved.approved_by?.name && approved.approved_at && (
                  <p className="text-caption text-ink-muted">{t("development.summary.approvedBy", { name: approved.approved_by.name, date: formatDate(approved.approved_at) })}</p>
                )}
                <SummaryView summary={approved} />
              </section>
            )}
            {data.history.length > 1 && (
              <div>
                <Button size="sm" variant="ghost" aria-expanded={historyOpen} onClick={() => setHistoryOpen((o) => !o)}>
                  {t("development.summary.history")}
                </Button>
                {historyOpen && (
                  <div className="mt-2 space-y-1">
                    <p className="text-caption text-ink-muted">{t("development.summary.historyHint")}</p>
                    <ol className="divide-y divide-line" data-testid="summary-history">
                      {data.history.map((h) => (
                        <li key={h.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                          <span className="text-ink">{formatDate(h.created_at)}</span>
                          {h.created_by?.name && <span className="text-ink-muted">{h.created_by.name}</span>}
                          <Badge tone={h.status === "approved" ? "success" : "muted"}>
                            {h.status === "approved" ? t("development.summary.approvedBadge") : t("development.summary.draft")}
                          </Badge>
                          {h.source === "ai_draft" && <span className="text-caption text-ink-muted">{t("development.summary.fromAi")}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardBody>
      <SummaryEditor
        childId={childId}
        draft={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </Card>
  );
}

function SummaryItems({ items }: { items: SummaryItem[] }) {
  const { optionLabel, item } = useOptions();
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <li key={`${it.key ?? it.custom}-${i}`}>
          <Chip tone="strength" icon={it.key ? item("strengths", it.key)?.icon : undefined}>
            <span dir="auto">{it.key ? optionLabel("strengths", it.key) : it.custom}</span>
          </Chip>
        </li>
      ))}
    </ul>
  );
}

export function SummaryView({ summary }: { summary: SummaryFields }) {
  const { t } = useI18n();
  const block = (key: string, body: ReactNode) => (
    <div key={key} className="space-y-1" data-testid={`summary-${key}`}>
      <h4 className="text-caption font-semibold text-ink-muted">{t(`development.summary.fields.${key}`)}</h4>
      {body}
    </div>
  );
  const text = (v: string | null | undefined) =>
    v ? (
      <p className="text-sm whitespace-pre-line text-ink" dir="auto">
        {v}
      </p>
    ) : (
      <p className="text-sm text-ink-muted">{t("development.sections.empty")}</p>
    );
  const strengths = summary.main_strengths ?? { items: [], text: null };
  const needs = summary.main_needs ?? { items: [], text: null };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {block("general_description", text(summary.general_description))}
      {block(
        "main_strengths",
        <>
          {strengths.items.length > 0 && <SummaryItems items={strengths.items} />}
          {strengths.text || !strengths.items.length ? text(strengths.text) : null}
        </>,
      )}
      {block(
        "main_needs",
        <>
          {needs.items.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {needs.items.map((n, i) => (
                <li key={i}>
                  <Chip tone="attention">
                    <span dir="auto">{n}</span>
                  </Chip>
                </li>
              ))}
            </ul>
          )}
          {needs.text || !needs.items.length ? text(needs.text) : null}
        </>,
      )}
      {block("adaptations", text(summary.adaptations))}
      {block("follow_up_with_parents", text(summary.follow_up_with_parents))}
      {block("team_recommendations", text(summary.team_recommendations))}
    </div>
  );
}

function SummaryEditor({ childId, draft, onClose, onSaved }: { childId: string; draft: SummaryDraft | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog open={!!draft} onClose={onClose} title={t("development.summary.editor.title")} size="xl">
      {draft && <SummaryForm key={draft.aiSuggestionId ?? draft.supersedesId ?? "new"} childId={childId} initial={draft} onCancel={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function SummaryForm({ childId, initial, onCancel, onSaved }: { childId: string; initial: SummaryDraft; onCancel: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { list, labelOf, optionLabel } = useOptions();
  const saving = useAction();
  const [d, setD] = useState<SummaryDraft>(initial);
  const [compare, setCompare] = useState(false);
  const [unsafe, setUnsafe] = useState(false);
  const [custom, setCustom] = useState("");
  const set = (patch: Partial<SummaryDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const chosen = new Set(d.strengths.map((s) => (s.key ? `k:${s.key}` : `c:${(s.custom ?? "").toLowerCase()}`)));
  const ai = d.ai;

  async function save(thenApprove: boolean) {
    setUnsafe(false);
    if (isEmpty(d)) {
      toast(t("development.summary.editor.empty"), "error");
      return;
    }
    const r = await saving.run(() => saveSummary(childId, summaryPayload(d)), {
      success: thenApprove ? undefined : t("development.summary.toasts.saved"),
      errorToast: false,
      onError: (e) => {
        if (isApiError(e, "UNSAFE_CONTENT")) setUnsafe(true);
        else toast(toMessage(e), "error");
      },
    });
    if (!r.ok) return;
    // The draft is saved either way; an approval problem is shown as a toast.
    if (thenApprove) await saving.run(() => approveSummary(r.data.summary.id), { success: t("development.summary.toasts.approved") });
    onSaved();
  }

  const aiText = (v: string | null | undefined) =>
    compare && ai ? (
      <p className="text-caption rounded-sm bg-tray/60 p-2 whitespace-pre-line text-ink-muted" dir="auto" data-testid="ai-text">
        <span className="font-semibold">{t("development.summary.editor.aiText")}: </span>
        {v || t("development.sections.empty")}
      </p>
    ) : null;

  const textField = (k: TextField, rows: number) => (
    <div className="space-y-1.5">
      <Field label={t(`development.summary.fields.${k}`)}>
        {(p) => <Textarea {...p} dir="auto" rows={rows} maxLength={LIMITS[k]} value={d[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<SummaryDraft>)} />}
      </Field>
      {k !== "follow_up_with_parents" && aiText(ai?.[k])}
    </div>
  );

  return (
    <div className="space-y-5">
      {d.source === "ai_draft" && (
        <Alert tone="tip">
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceBadges kinds={["ai_suggested"]} />
            <span>{t("development.summary.editor.aiNote")}</span>
          </div>
        </Alert>
      )}
      {ai && (
        <Button size="sm" variant="ghost" aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
          {compare ? t("development.summary.editor.hideCompare") : t("development.summary.editor.compare")}
        </Button>
      )}
      {textField("general_description", 4)}

      <fieldset className="space-y-2" data-testid="summary-strengths">
        <legend className="mb-1 text-sm font-medium text-ink">{t("development.summary.fields.main_strengths")}</legend>
        {d.strengths.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {d.strengths.map((s, i) => {
              const label = s.key ? optionLabel("strengths", s.key) : (s.custom ?? "");
              return (
                <li key={`${s.key ?? s.custom}-${i}`}>
                  <button
                    type="button"
                    aria-label={t("development.summary.editor.remove", { label })}
                    onClick={() => set({ strengths: d.strengths.filter((_, j) => j !== i) })}
                    className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-strength-soft px-3.5 text-sm font-medium text-ink"
                  >
                    <span dir="auto">{label}</span>
                    <X className="size-4 opacity-70" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            aria-label={t("development.summary.editor.chooseStrength")}
            value=""
            onChange={(e) => e.target.value && set({ strengths: [...d.strengths, { key: e.target.value }].slice(0, 10) })}
          >
            <option value="">{t("development.summary.editor.chooseStrength")}</option>
            {list("strengths")
              .filter((o) => !chosen.has(`k:${o.key}`))
              .map((o) => (
                <option key={o.key} value={o.key}>
                  {`${o.icon ?? ""} ${labelOf(o)}`.trim()}
                </option>
              ))}
          </Select>
          <div className="flex gap-2">
            <Input
              dir="auto"
              maxLength={120}
              value={custom}
              aria-label={t("development.summary.editor.customStrength")}
              placeholder={t("development.summary.editor.customStrength")}
              onChange={(e) => setCustom(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={!custom.trim() || chosen.has(`c:${custom.trim().toLowerCase()}`)}
              onClick={() => {
                set({ strengths: [...d.strengths, { custom: custom.trim() }].slice(0, 10) });
                setCustom("");
              }}
            >
              {t("development.summary.editor.add")}
            </Button>
          </div>
        </div>
        <Field label={t("development.summary.editor.notes")}>
          {(p) => <Textarea {...p} dir="auto" rows={2} maxLength={1000} value={d.strengthsText} onChange={(e) => set({ strengthsText: e.target.value })} />}
        </Field>
        {aiText(ai ? [...ai.main_strengths.items.map((s) => (s.key ? optionLabel("strengths", s.key) : s.custom)), ai.main_strengths.text].filter(Boolean).join(" · ") : null)}
      </fieldset>

      <fieldset className="space-y-2" data-testid="summary-needs">
        <legend className="mb-1 text-sm font-medium text-ink">{t("development.summary.fields.main_needs")}</legend>
        {d.needs.map((n, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              dir="auto"
              maxLength={300}
              value={n}
              aria-label={t("development.summary.fields.main_needs")}
              placeholder={t("development.summary.editor.areaPlaceholder")}
              onChange={(e) => set({ needs: d.needs.map((x, j) => (j === i ? e.target.value : x)) })}
            />
            <IconButton label={t("development.summary.editor.removeArea")} onClick={() => set({ needs: d.needs.filter((_, j) => j !== i) })}>
              <X className="size-4" aria-hidden />
            </IconButton>
          </div>
        ))}
        <Button variant="ghost" icon={<Plus className="size-4" aria-hidden />} disabled={d.needs.length >= 10} onClick={() => set({ needs: [...d.needs, ""] })}>
          {t("development.summary.editor.addArea")}
        </Button>
        <Field label={t("development.summary.editor.notes")}>
          {(p) => <Textarea {...p} dir="auto" rows={2} maxLength={1000} value={d.needsText} onChange={(e) => set({ needsText: e.target.value })} />}
        </Field>
        {aiText(ai ? [...ai.main_needs.items, ai.main_needs.text].filter(Boolean).join(" · ") : null)}
      </fieldset>

      {textField("adaptations", 3)}
      {textField("follow_up_with_parents", 2)}
      {textField("team_recommendations", 2)}

      {unsafe && <Alert tone="warning">{t("development.summary.editor.unsafe")}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("development.summary.editor.cancel")}
        </Button>
        <Button variant="outline" loading={saving.pending} onClick={() => save(false)}>
          {t("development.summary.editor.save")}
        </Button>
        <Button loading={saving.pending} icon={<BadgeCheck className="size-4" aria-hidden />} onClick={() => save(true)}>
          {t("development.summary.editor.saveApprove")}
        </Button>
      </div>
    </div>
  );
}

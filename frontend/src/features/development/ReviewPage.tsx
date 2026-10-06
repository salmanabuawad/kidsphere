import { useRef, useState, type RefObject } from "react";
import { useNavigate, useParams } from "react-router";
import { ClipboardCheck, Lightbulb, Plus, Sparkles, Wand2, X } from "lucide-react";
import { CurrentFocusIcon } from "@/icons";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  IconButton,
  Input,
  PageHeader,
  PageSkeleton,
  Select,
  Textarea,
  toast,
  ToggleChip,
  toneClasses,
  type Tone,
} from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { isApiError } from "@/lib/api";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { childUrl, displayName, useProfileItem, type ChildDetail, type ProfileItem } from "@/features/children";
import {
  baselineItemId,
  currentUnderstandingUrl,
  DECISIONS,
  itemId,
  NEEDS_MORE,
  REVIEW_STATUSES,
  reviewsUrl,
  saveReview,
  suggestReview,
  VALIDATION_STATUSES,
  type BaselineItem,
  type CurrentUnderstanding,
  type CurrentUnderstandingResponse,
  type DraftContext,
  type DraftFocus,
  type Item,
  type ReviewInput,
  type ReviewsResponse,
  type ReviewStatus,
  type SuggestResponse,
  type UnderstandingList,
  type ValidationStatus,
} from "./api";
import { emptyFollowUp, followUpPayload, FollowUpStep, type FollowUpDraft } from "./FollowUpStep";
import { EvidenceText, isLimited, REVIEW_ICON, VALIDATION_ICON } from "./parts";

type KeptDecision = (typeof DECISIONS)[number];

export type FocusDraft = {
  id: string;
  title: string;
  description: string | null;
  observation_count: number;
  status: ReviewStatus;
  decision: KeptDecision;
  note: string;
  what_worked: string;
  what_to_change: string;
  editTitle: string;
  editDescription: string;
};
export type NewFocus = { uid: string; suggestion_key?: string; category?: string; title: string };
export type ValidationDraft = BaselineItem & { status: ValidationStatus; note: string; observation_ids: string[] };
export type UnderstandingDraft = {
  summary: string;
  strengths: Item[];
  interests: Item[];
  what_helps: Item[];
  areas: string[];
  adaptations: string;
  next_steps: string;
};
export type Draft = {
  source: "suggestion" | "blank";
  isTemplate: boolean;
  /** The stored AI suggestion this draft started from (sent back as ai_suggestion_id). */
  suggestionId?: string;
  ctx: DraftContext;
  focus: FocusDraft[];
  added: NewFocus[];
  validation: ValidationDraft[];
  understanding: UnderstandingDraft;
  /** Domain 16: always starts empty; only the teacher fills it in. */
  followUp: FollowUpDraft;
};

// --------------------------------------------------------------------------- draft helpers

const toItem = (it: { key?: string | null; custom?: string | null; list?: string | null }): Item =>
  it.key ? (it.list ? { key: it.key, list: it.list } : { key: it.key }) : { custom: it.custom ?? "" };

function uniqueItems(items: Item[]): Item[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const id = itemId(it);
    if ((!it.key && !it.custom?.trim()) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const focusDraft = (f: DraftFocus, status: ReviewStatus, note: string): FocusDraft => ({
  id: f.id,
  title: f.title,
  description: f.description,
  observation_count: f.observation_count,
  status,
  decision: status === "no_longer_needed" ? "close" : "keep",
  note,
  what_worked: "",
  what_to_change: "",
  editTitle: f.title,
  editDescription: f.description ?? "",
});

/** "Start from the current picture": lists and texts from the current understanding, a fresh summary. */
export function blankDraft(ctx: DraftContext, cu: CurrentUnderstanding | null): Draft {
  return {
    source: "blank",
    isTemplate: false,
    ctx,
    focus: ctx.focus_areas.map((f) => focusDraft(f, NEEDS_MORE, "")),
    added: [],
    validation: ctx.baseline_items.map((b) => ({ ...b, status: NEEDS_MORE, note: "", observation_ids: [] })),
    understanding: {
      summary: "",
      strengths: uniqueItems((cu?.strengths ?? []).map(toItem)),
      interests: uniqueItems((cu?.interests ?? []).map(toItem)),
      what_helps: uniqueItems((cu?.what_helps ?? []).map(toItem)),
      areas: [...(cu?.areas_for_support ?? [])],
      adaptations: cu?.adaptations ?? "",
      next_steps: cu?.next_steps ?? "",
    },
    followUp: emptyFollowUp(),
  };
}

/** "Suggest a summary": everything from /suggest (statuses already follow PLAN B6). */
export function suggestedDraft(res: SuggestResponse): Draft {
  const s = res.suggestion;
  const byFocus = new Map(s.focus_review.map((f) => [f.focus_area_id, f]));
  const byItem = new Map(s.baseline_validation.map((b) => [baselineItemId(b), b]));
  return {
    source: "suggestion",
    isTemplate: res.is_template,
    suggestionId: res.suggestion_id,
    ctx: res,
    focus: res.focus_areas.map((f) => {
      const sf = byFocus.get(f.id);
      return focusDraft(f, sf?.status ?? NEEDS_MORE, sf?.note ?? "");
    }),
    added: [],
    validation: res.baseline_items.map((b) => {
      const sv = byItem.get(baselineItemId(b));
      return { ...b, status: sv?.status ?? NEEDS_MORE, note: sv?.note ?? "", observation_ids: sv?.observation_ids ?? [] };
    }),
    understanding: {
      summary: s.summary,
      strengths: uniqueItems(s.strengths.map(toItem)),
      interests: uniqueItems(s.interests.map(toItem)),
      what_helps: uniqueItems(s.what_helps.map(toItem)),
      areas: [...s.areas_for_support],
      adaptations: s.adaptations ?? "",
      next_steps: s.next_steps ?? "",
    },
    followUp: emptyFollowUp(),
  };
}

const opt = (s: string) => s.trim() || undefined;

export function buildPayload(d: Draft): ReviewInput {
  const u = d.understanding;
  const followUp = followUpPayload(d.followUp);
  const items = (list: Item[], helps = false): Item[] =>
    uniqueItems(list).map((it) => (it.key ? (helps && it.list ? { key: it.key, list: it.list } : { key: it.key }) : { custom: (it.custom ?? "").trim() }));
  const summary = u.summary.trim();
  return {
    summary,
    understanding: {
      summary,
      strengths: items(u.strengths),
      interests: items(u.interests),
      what_helps: items(u.what_helps, true),
      areas_for_support: u.areas.map((a) => a.trim()).filter(Boolean),
      adaptations: u.adaptations.trim() || null,
      next_steps: u.next_steps.trim() || null,
    },
    baseline_validation: d.validation.map((v) => ({
      list: v.list,
      key: v.key,
      custom: v.custom,
      label: v.label,
      status: v.status,
      note: v.note.trim() || null,
      observation_ids: v.observation_ids,
    })),
    focus_review: [
      ...d.focus.map((f) => ({
        focus_area_id: f.id,
        status: f.status,
        decision: f.decision,
        what_worked: opt(f.what_worked),
        what_to_change: opt(f.what_to_change),
        note: opt(f.note),
        ...(f.decision === "edit" ? { edit: { title: opt(f.editTitle) ?? f.title, description: f.editDescription.trim() || null } } : {}),
      })),
      ...d.added.map((n) => ({
        decision: "create" as const,
        create: n.suggestion_key ? { suggestion_key: n.suggestion_key, title: n.title } : { category: n.category, title: n.title },
      })),
    ],
    ...(followUp ? { follow_up: followUp } : {}),
    ai_suggested: d.source === "suggestion",
    ...(d.source === "suggestion" && d.suggestionId ? { ai_suggestion_id: d.suggestionId } : {}),
  };
}

/** Active focus areas after this review (pause/close free a place, new ones take one). */
export const projectedActive = (d: Draft) => d.focus.filter((f) => f.decision !== "pause" && f.decision !== "close").length + d.added.length;

// --------------------------------------------------------------------------- page

/** /children/:id/review/new — "Review development": suggest or start blank, decide per focus, check the baseline, approve. */
export function ReviewPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const child = useFetch<{ child: ChildDetail }>(childUrl(id));
  const reviews = useFetch<ReviewsResponse>(reviewsUrl(id));
  const cu = useFetch<CurrentUnderstandingResponse>(currentUnderstandingUrl(id));
  const error = child.error ?? reviews.error ?? cu.error;

  if (error)
    return (
      <Alert
        tone="error"
        action={
          error.status === 404 ? (
            <ButtonLink size="sm" variant="outline" to={paths.children()}>
              {t("children.child.backToList")}
            </ButtonLink>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                child.reload();
                reviews.reload();
                cu.reload();
              }}
            >
              {t("common.retry")}
            </Button>
          )
        }
      >
        {toMessage(error)}
      </Alert>
    );
  if (!child.data || !reviews.data || !cu.data) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ to: paths.childDevelopment(id), label: t("development.review.back") }}
        eyebrow={<span dir="auto">{displayName(child.data.child)}</span>}
        title={t("development.review.title")}
        description={t("development.review.intro")}
        icon={<ClipboardCheck aria-hidden />}
      />
      <ReviewFlow childId={id} context={reviews.data.context} current={cu.data.current_understanding} />
    </div>
  );
}

function ReviewFlow({ childId, context, current }: { childId: string; context: DraftContext; current: CurrentUnderstanding | null }) {
  const { t, locale } = useI18n();
  const { formatDate } = useFormat();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();
  const suggesting = useAction();
  const saving = useAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [unsafe, setUnsafe] = useState(false);
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  const ctx = draft?.ctx ?? context;
  const update = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d));

  async function suggest() {
    const r = await suggesting.run(() => suggestReview(childId, locale));
    if (r.ok) {
      setDraft(suggestedDraft(r.data));
      setUnsafe(false);
    }
  }

  async function approve() {
    if (!draft) return;
    if (!draft.understanding.summary.trim()) {
      setSummaryError(true);
      summaryRef.current?.focus();
      return;
    }
    setUnsafe(false);
    const r = await saving.run(() => saveReview(childId, buildPayload(draft)), {
      errorToast: false,
      onError: (e) => {
        if (isApiError(e, "UNSAFE_CONTENT")) setUnsafe(true);
        else toast(toMessage(e), "error");
      },
    });
    if (r.ok) {
      toast(t("development.review.saved"));
      navigate(paths.childDevelopment(childId), { state: { warnings: r.data.warnings } });
    }
  }

  const sinceText = ctx.baseline
    ? ctx.observation_count_since_baseline > 0
      ? t("development.review.observationsSince", { count: ctx.observation_count_since_baseline, date: formatDate(ctx.baseline.created_at) })
      : t("development.review.noObservationsSince", { date: formatDate(ctx.baseline.created_at) })
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t("development.review.start.title")} icon={<Wand2 className="size-4" aria-hidden />} description={sinceText ?? undefined} />
        <CardBody className="space-y-4">
          {!ctx.baseline && <Alert tone="info">{t("development.review.noBaseline")}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-line p-4">
              <Button size="lg" className="w-full" loading={suggesting.pending} icon={<Sparkles className="size-5" aria-hidden />} onClick={suggest}>
                {draft?.source === "suggestion" ? t("development.review.start.again") : t("development.review.start.suggest")}
              </Button>
              <p className="text-sm text-ink-muted">{t("development.review.start.suggestHint")}</p>
            </div>
            <div className="space-y-2 rounded-lg border border-line p-4">
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                disabled={suggesting.pending}
                onClick={() => {
                  setDraft(blankDraft(context, current));
                  setUnsafe(false);
                }}
              >
                {t("development.review.start.blank")}
              </Button>
              <p className="text-sm text-ink-muted">{t("development.review.start.blankHint")}</p>
            </div>
          </div>
          {draft?.source === "suggestion" && (
            <Alert tone="tip" title={draft.isTemplate ? undefined : t("development.review.suggestion.ai")}>
              <div className="flex flex-wrap items-center gap-2">
                {draft.isTemplate && (
                  <Badge tone="neutral" icon={<Lightbulb className="size-3.5" aria-hidden />}>
                    {t("development.review.suggestion.template")}
                  </Badge>
                )}
                <span>{t("development.review.suggestion.check")}</span>
              </div>
            </Alert>
          )}
        </CardBody>
      </Card>

      {draft && (
        <>
          <FocusStep draft={draft} update={update} />
          <ValidationStep draft={draft} update={update} />
          <UnderstandingStep
            draft={draft}
            update={(fn) => {
              setSummaryError(false);
              update(fn);
            }}
            summaryError={summaryError}
            summaryRef={summaryRef}
          />
          <FollowUpStep
            value={draft.followUp}
            focusAreas={draft.ctx.focus_areas}
            onChange={(patch) => update((d) => ({ ...d, followUp: { ...d.followUp, ...patch } }))}
          />
          <Card>
            <CardBody className="space-y-3">
              {unsafe && <Alert tone="warning">{t("development.review.unsafe")}</Alert>}
              <p className="text-sm text-ink-muted">{t("development.review.approveHint")}</p>
              <div className="flex flex-wrap justify-end gap-2">
                <ButtonLink to={paths.childDevelopment(childId)} variant="ghost" size="lg">
                  {t("development.review.cancel")}
                </ButtonLink>
                <Button size="lg" loading={saving.pending} icon={<ClipboardCheck className="size-5" aria-hidden />} onClick={approve}>
                  {t("development.review.approve")}
                </Button>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- step 1: focus

function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
  tone = "brand",
}: {
  label: string;
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  tone?: Tone;
}) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p className="text-sm font-medium text-ink">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <ToggleChip key={o.value} tone={tone} selected={value === o.value} icon={o.icon} onToggle={() => onChange(o.value)}>
            {o.label}
          </ToggleChip>
        ))}
      </div>
    </div>
  );
}

function FocusStep({ draft, update }: { draft: Draft; update: (fn: (d: Draft) => Draft) => void }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const max = draft.ctx.max_active;
  const full = projectedActive(draft) >= max;
  const setFocus = (id: string, patch: Partial<FocusDraft>) =>
    update((d) => ({ ...d, focus: d.focus.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  return (
    <Card>
      <CardHeader title={t("development.review.steps.focus")} icon={<CurrentFocusIcon />} description={t("development.review.focus.hint")} />
      <CardBody className="space-y-4">
        {draft.focus.length === 0 && <p className="text-sm text-ink-muted">{t("development.review.focus.none")}</p>}
        {draft.focus.map((f) => (
          <FocusReviewCard key={f.id} focus={f} onChange={(patch) => setFocus(f.id, patch)} />
        ))}
        {draft.added.length > 0 && (
          <ul className="space-y-2">
            {draft.added.map((n) => (
              <li key={n.uid} data-testid="new-focus" className="flex items-center justify-between gap-2 rounded-lg border border-line px-4 py-2">
                <span className="flex items-center gap-2 text-sm text-ink">
                  <Badge tone="attention">{t("development.review.focus.new")}</Badge>
                  <span dir="auto">{n.title}</span>
                </span>
                <IconButton
                  label={t("development.review.focus.remove", { title: n.title })}
                  onClick={() => update((d) => ({ ...d, added: d.added.filter((x) => x.uid !== n.uid) }))}
                >
                  <X className="size-4" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        {adding && !full ? (
          <AddFocus
            takenKeys={draft.added.map((n) => n.suggestion_key).filter((k): k is string => !!k)}
            onCancel={() => setAdding(false)}
            onAdd={(n) => {
              update((d) => ({ ...d, added: [...d.added, n] }));
              setAdding(false);
            }}
          />
        ) : (
          <div className="space-y-1">
            <Button variant="outline" icon={<Plus className="size-4" aria-hidden />} disabled={full} onClick={() => setAdding(true)}>
              {t("development.review.focus.add")}
            </Button>
            {full && <p className="text-caption text-ink-muted">{t("development.review.focus.full", { max })}</p>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function FocusReviewCard({ focus, onChange }: { focus: FocusDraft; onChange: (patch: Partial<FocusDraft>) => void }) {
  const { t } = useI18n();
  const limited = isLimited(focus.status, focus.observation_count);
  return (
    <section data-testid="focus-review" aria-label={focus.title} className="space-y-4 rounded-lg border border-line p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-ink" dir="auto">
          {focus.title}
        </h3>
        <EvidenceText count={focus.observation_count} className="text-sm text-ink-muted" />
        {focus.note && (
          <p className="text-sm text-ink-muted" dir="auto">
            {focus.note}
          </p>
        )}
      </div>
      <ChoiceRow<ReviewStatus>
        label={t("development.review.focus.statusLabel")}
        value={focus.status}
        options={REVIEW_STATUSES.map((s) => ({ value: s, label: t(`development.status.${s}`), icon: REVIEW_ICON[s] }))}
        onChange={(status) => onChange(status === "no_longer_needed" && focus.decision === "keep" ? { status, decision: "close" } : { status })}
      />
      {limited && <p className="text-caption text-ink-muted">{t("development.review.limited")}</p>}
      <ChoiceRow<KeptDecision>
        label={t("development.review.focus.decisionLabel")}
        value={focus.decision}
        options={DECISIONS.map((d) => ({ value: d, label: t(`development.decision.${d}`) }))}
        onChange={(decision) => onChange({ decision })}
        tone="attention"
      />
      {focus.decision === "edit" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("development.review.focus.editTitle")}>
            {(p) => <Input {...p} dir="auto" maxLength={200} value={focus.editTitle} onChange={(e) => onChange({ editTitle: e.target.value })} />}
          </Field>
          <Field label={t("development.review.focus.editDescription")}>
            {(p) => <Input {...p} dir="auto" maxLength={2000} value={focus.editDescription} onChange={(e) => onChange({ editDescription: e.target.value })} />}
          </Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("development.review.focus.whatWorked")}>
          {(p) => <Textarea {...p} rows={2} maxLength={1000} value={focus.what_worked} onChange={(e) => onChange({ what_worked: e.target.value })} />}
        </Field>
        <Field label={t("development.review.focus.whatToChange")}>
          {(p) => <Textarea {...p} rows={2} maxLength={1000} value={focus.what_to_change} onChange={(e) => onChange({ what_to_change: e.target.value })} />}
        </Field>
      </div>
    </section>
  );
}

function AddFocus({ takenKeys, onAdd, onCancel }: { takenKeys: string[]; onAdd: (n: NewFocus) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const { list, labelOf } = useOptions();
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const categories = list("priority_categories");
  const suggestions = list("focus_suggestions");
  const uid = () => `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <div className="space-y-4 rounded-lg border border-line p-4" data-testid="add-focus">
      <p className="text-sm font-semibold text-ink">{t("development.review.focus.addTitle")}</p>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">{t("development.review.focus.suggestions")}</p>
        {categories.map((cat) => {
          const items = suggestions.filter((s) => s.category === cat.key);
          if (!items.length) return null;
          return (
            <div key={cat.key} className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
                {cat.icon && <span aria-hidden>{cat.icon}</span>}
                {labelOf(cat)}
              </p>
              <div className="flex flex-wrap gap-2">
                {items.map((s) => (
                  <ToggleChip
                    key={s.key}
                    tone="attention"
                    selected={takenKeys.includes(s.key)}
                    disabled={takenKeys.includes(s.key)}
                    onToggle={() => onAdd({ uid: uid(), suggestion_key: s.key, title: labelOf(s) })}
                  >
                    {labelOf(s)}
                  </ToggleChip>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">{t("development.review.focus.orCustom")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("development.review.focus.category")}>
            {(p) => (
              <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{t("development.review.focus.choose")}</option>
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {`${c.icon ?? ""} ${labelOf(c)}`.trim()}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("development.review.focus.customTitle")}>
            {(p) => <Input {...p} dir="auto" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("development.review.cancel")}
        </Button>
        <Button
          icon={<Plus className="size-4" aria-hidden />}
          disabled={!category || !title.trim()}
          onClick={() => onAdd({ uid: uid(), category, title: title.trim() })}
        >
          {t("development.review.focus.addThis")}
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- step 2: baseline validation

function ValidationStep({ draft, update }: { draft: Draft; update: (fn: (d: Draft) => Draft) => void }) {
  const { t } = useI18n();
  const setStatus = (i: number, status: ValidationStatus) =>
    update((d) => ({ ...d, validation: d.validation.map((v, j) => (j === i ? { ...v, status } : v)) }));
  return (
    <Card>
      <CardHeader
        title={t("development.review.steps.validation")}
        icon={<ClipboardCheck className="size-4" aria-hidden />}
        description={t("development.review.validation.hint")}
      />
      <CardBody>
        {draft.validation.length === 0 ? (
          <EmptyState title={t("development.review.validation.none")} />
        ) : (
          <ul className="divide-y divide-line">
            {draft.validation.map((v, i) => (
              <li key={baselineItemId(v)} data-testid="validation-item" className="space-y-2 py-4 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    <span className="font-normal text-ink-muted">{t(`development.validation.lists.${v.list}`)} · </span>
                    <span dir="auto">{v.label}</span>
                  </p>
                  <EvidenceText count={v.observation_ids.length} />
                  {v.note && (
                    <p className="text-sm text-ink-muted" dir="auto">
                      {v.note}
                    </p>
                  )}
                </div>
                <ChoiceRow<ValidationStatus>
                  label={t("development.review.validation.statusLabel", { label: v.label })}
                  value={v.status}
                  options={VALIDATION_STATUSES.map((s) => ({ value: s, label: t(`development.validation.status.${s}`), icon: VALIDATION_ICON[s] }))}
                  onChange={(s) => setStatus(i, s)}
                />
                {isLimited(v.status, v.observation_ids.length) && <p className="text-caption text-ink-muted">{t("development.review.limited")}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// --------------------------------------------------------------------------- step 3: understanding

const LIST_SETUP: { list: UnderstandingList; optionList: string; tone: Tone; titleKey: string; icon?: string }[] = [
  { list: "strengths", optionList: "strengths", tone: "strength", titleKey: "development.sections.strengths", icon: "⭐" },
  { list: "interests", optionList: "interests", tone: "interest", titleKey: "development.sections.interests" },
  { list: "what_helps", optionList: "what_helps", tone: "helps", titleKey: "development.sections.whatHelps", icon: "✓" },
];

function UnderstandingStep({
  draft,
  update,
  summaryError,
  summaryRef,
}: {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  summaryError: boolean;
  summaryRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const { t } = useI18n();
  const u = draft.understanding;
  const set = (patch: Partial<UnderstandingDraft>) => update((d) => ({ ...d, understanding: { ...d.understanding, ...patch } }));
  return (
    <Card>
      <CardHeader
        title={t("development.review.steps.understanding")}
        icon={<Sparkles className="size-4" aria-hidden />}
        description={t("development.review.understanding.hint")}
      />
      <CardBody className="space-y-6">
        <Field
          label={t("development.review.understanding.summary")}
          hint={t("development.review.understanding.summaryHint")}
          error={summaryError ? t("development.review.summaryRequired") : undefined}
          required
        >
          {(p) => <Textarea {...p} ref={summaryRef} rows={5} maxLength={4000} value={u.summary} onChange={(e) => set({ summary: e.target.value })} />}
        </Field>
        {LIST_SETUP.map((s) => (
          <ItemsEditor
            key={s.list}
            list={s.list}
            optionList={s.optionList}
            title={t(s.titleKey)}
            tone={s.tone}
            fallbackIcon={s.icon}
            items={u[s.list]}
            onChange={(items) => set({ [s.list]: items } as Partial<UnderstandingDraft>)}
          />
        ))}
        <AreasEditor areas={u.areas} onChange={(areas) => set({ areas })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("development.current.adaptations")}>
            {(p) => <Textarea {...p} rows={3} maxLength={2000} value={u.adaptations} onChange={(e) => set({ adaptations: e.target.value })} />}
          </Field>
          <Field label={t("development.current.nextSteps")}>
            {(p) => <Textarea {...p} rows={3} maxLength={2000} value={u.next_steps} onChange={(e) => set({ next_steps: e.target.value })} />}
          </Field>
        </div>
      </CardBody>
    </Card>
  );
}

function ItemsEditor({
  list,
  optionList,
  title,
  tone,
  fallbackIcon,
  items,
  onChange,
}: {
  list: UnderstandingList;
  optionList: string;
  title: string;
  tone: Tone;
  fallbackIcon?: string;
  items: Item[];
  onChange: (items: Item[]) => void;
}) {
  const { t } = useI18n();
  const resolve = useProfileItem();
  const { list: options, labelOf } = useOptions();
  const [custom, setCustom] = useState("");
  const chosen = new Set(items.map(itemId));
  const available = options(optionList).filter((o) => o.key !== "other" && !chosen.has(`k:${o.key}`));
  const addCustom = () => {
    const text = custom.trim();
    if (!text || chosen.has(itemId({ custom: text }))) return;
    onChange([...items, { custom: text }]);
    setCustom("");
  };

  return (
    <fieldset className="space-y-2" data-testid={`items-${list}`}>
      <legend className="mb-2 text-sm font-semibold text-ink">{title}</legend>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((it) => {
            const r = resolve(list, it as ProfileItem);
            return (
              <li key={itemId(it)}>
                <button
                  type="button"
                  aria-label={t("development.review.understanding.removeItem", { label: r.label })}
                  onClick={() => onChange(items.filter((x) => itemId(x) !== itemId(it)))}
                  className={cn("inline-flex min-h-11 items-center gap-2 rounded-sm px-3.5 text-sm font-medium", toneClasses[tone])}
                >
                  {(r.icon ?? fallbackIcon) && <span aria-hidden>{r.icon ?? fallbackIcon}</span>}
                  <span dir="auto">{r.label}</span>
                  <X className="size-4 opacity-70" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          aria-label={t("development.review.understanding.addFrom", { list: title })}
          value=""
          onChange={(e) => {
            const key = e.target.value;
            if (key) onChange([...items, list === "what_helps" ? { key, list: optionList } : { key }]);
          }}
        >
          <option value="">{t("development.review.understanding.choose")}</option>
          {available.map((o) => (
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
            aria-label={t("development.review.understanding.customFor", { list: title })}
            placeholder={t("development.review.understanding.custom")}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button variant="outline" disabled={!custom.trim()} onClick={addCustom}>
            {t("development.review.understanding.add")}
          </Button>
        </div>
      </div>
    </fieldset>
  );
}

function AreasEditor({ areas, onChange }: { areas: string[]; onChange: (areas: string[]) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-2" data-testid="areas-editor">
      <legend className="mb-2 text-sm font-semibold text-ink">{t("development.sections.areasForSupport")}</legend>
      {areas.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            dir="auto"
            maxLength={300}
            value={a}
            aria-label={t("development.sections.areasForSupport")}
            placeholder={t("development.review.understanding.areaPlaceholder")}
            onChange={(e) => onChange(areas.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <IconButton label={t("development.review.understanding.removeArea")} onClick={() => onChange(areas.filter((_, j) => j !== i))}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </div>
      ))}
      <Button variant="ghost" icon={<Plus className="size-4" aria-hidden />} disabled={areas.length >= 10} onClick={() => onChange([...areas, ""])}>
        {t("development.review.understanding.addArea")}
      </Button>
    </fieldset>
  );
}

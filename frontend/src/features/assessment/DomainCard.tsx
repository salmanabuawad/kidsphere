import { useMemo, useState } from "react";
import { ChevronDown, History, Save } from "lucide-react";
import { Alert, Badge, Button, Card, Dialog, Field, Input, Skeleton } from "@/components/ui";
import { ProvenanceBadges, StatusPicker, StatusPill, normalizeStatus, type SectionStatus } from "@/components/source";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { useSourceModel } from "@/lib/sourceModel";
import { cn } from "@/lib/utils";
import {
  ITEM_DOMAINS,
  applyToProfile,
  historyUrl,
  needToFocus,
  saveDomain,
  type ApplyItem,
  type ApplyList,
  type Assessment,
  type Domain,
  type DomainData,
  type DomainSaved,
  type Entry,
  type Need,
  type Warning,
} from "./api";
import {
  compact,
  DayMap,
  DomainHints,
  FieldEditor,
  IndependenceRows,
  ItemRows,
  NeedCards,
  SensoryRows,
  StrengthSlots,
  StrengthsHere,
  type EditorContext,
} from "./editors";
import type { ParentSections } from "./parentHints";

function withoutCarried(data: DomainData | undefined): DomainData {
  const { carried_from: _carried, ...rest } = data ?? {};
  return rest;
}

/**
 * One teacher-observation section (D1–D13) as an accordion card: header with the section
 * status pill; when open, the section's items, fields and actions, a status choice and
 * "Save this area" (every save appends a version), plus "Earlier versions".
 */
export function DomainCard({
  domain,
  cycle,
  childId,
  open,
  onToggle,
  parentSections,
  onSaved,
  onFocusCreated,
  firstArea = false,
}: {
  domain: Domain;
  cycle: Assessment;
  childId: string;
  open: boolean;
  onToggle: () => void;
  parentSections: ParentSections;
  onSaved: (saved: DomainSaved) => void;
  onFocusCreated: () => void;
  /** The quick baseline names this section as the first area to observe (PQ-TCH-06). */
  firstArea?: boolean;
}) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { optionLabel } = useOptions();
  const section = sm.section("observation_model", domain);
  const title = section ? sm.label(section) : optionLabel("observation_domains", domain);
  const number = typeof section?.number === "number" ? section.number : null;
  const state = cycle.domains[domain];
  const status = normalizeStatus(state?.status);
  const headingId = `to-${domain}`;
  return (
    <Card className={cn("overflow-hidden", open && "border-line-strong")} data-domain={domain}>
      <h3 id={headingId} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-start md:px-5"
        >
          <span className="flex min-w-0 items-center gap-2">
            {number !== null && <span className="tabular text-caption font-semibold text-ink-muted">{number}.</span>}
            <span className="font-display text-title font-semibold text-ink" dir="auto">
              {title}
            </span>
            {firstArea && (
              <Badge tone="attention">
                {t("assessment.domain.firstArea")}
              </Badge>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <StatusPill status={status} />
            <ChevronDown className={cn("size-5 text-ink-muted transition-transform", open && "rotate-180")} aria-hidden />
          </span>
        </button>
      </h3>
      {open && (
        <DomainEditor
          key={cycle.id}
          domain={domain}
          cycle={cycle}
          childId={childId}
          title={title}
          parentSections={parentSections}
          onSaved={onSaved}
          onFocusCreated={onFocusCreated}
        />
      )}
    </Card>
  );
}

function DomainEditor({
  domain,
  cycle,
  childId,
  title,
  parentSections,
  onSaved,
  onFocusCreated,
}: {
  domain: Domain;
  cycle: Assessment;
  childId: string;
  title: string;
  parentSections: ParentSections;
  onSaved: (saved: DomainSaved) => void;
  onFocusCreated: () => void;
}) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { formatDate } = useFormat();
  const state = cycle.domains[domain];
  const readOnly = cycle.status !== "open";
  const saved = useMemo(() => withoutCarried(state?.data), [state?.data]);
  const [draft, setDraft] = useState<DomainData>(saved);
  const [status, setStatus] = useState<SectionStatus>(state ? normalizeStatus(state.status) : "in_progress");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [titleFor, setTitleFor] = useState<{ index: number; need: Need } | null>(null);
  const saving = useAction();
  const applying = useAction();
  const promoting = useAction();
  const dirty = JSON.stringify(compact(draft)) !== JSON.stringify(compact(saved)) || status !== normalizeStatus(state?.status ?? "in_progress");
  const carried = state?.data?.carried_from;

  async function save() {
    const r = await saving.run(() => saveDomain(cycle.id, domain, status, compact(draft)), { success: t("assessment.domain.saved") });
    if (r.ok) {
      setWarnings(r.data.warnings ?? []);
      setDraft(withoutCarried(r.data.data));
      setStatus(normalizeStatus(r.data.status));
      onSaved(r.data);
    }
  }

  async function apply(list: ApplyList, items: ApplyItem[]) {
    await applying.run(() => applyToProfile(cycle.id, list, domain, items), { success: t("assessment.domain.addedToProfile") });
  }

  async function promote(index: number, need: Need, title?: string) {
    if (need.area === "behaviour" && !title) {
      setTitleFor({ index, need });
      return;
    }
    const r = await promoting.run(() => needToFocus(cycle.id, index, title ? { title } : {}), { success: t("assessment.needs.focusMade") });
    if (r.ok) {
      setTitleFor(null);
      onFocusCreated();
    }
  }

  const ctx: EditorContext = {
    childId,
    parentSections,
    readOnly,
    apply: (list, items) => void apply(list, items),
    applying: applying.pending,
    promote: (index, need) => void promote(index, need),
    promoting: promoting.pending,
    promoted: new Map(
      cycle.need_focus_areas.filter((n) => n.status === "active" || n.status === "paused").map((n) => [n.index, n.title] as [number, string]),
    ),
    dirty,
  };
  const props = { domain, data: draft, onChange: setDraft, ctx };
  const fieldItems = sm.items("observation_model", domain).filter((i) => i.kind === "field");
  const guidance = sm.items("observation_model", domain).find((i) => i.kind === "guidance");

  let body;
  if (ITEM_DOMAINS.includes(domain)) {
    body = (
      <>
        {guidance && (
          <Alert tone="tip" className="text-sm">
            {sm.label(guidance)}
          </Alert>
        )}
        <ItemRows {...props} />
        {fieldItems.map((item) => (
          <FieldEditor key={item.id} {...props} item={item} />
        ))}
        <StrengthsHere data={draft} onChange={setDraft} ctx={ctx} />
      </>
    );
  } else if (domain === "independence") body = <IndependenceRows {...props} />;
  else if (domain === "sensory")
    body = (
      <>
        <SensoryRows {...props} />
        {fieldItems.map((item) => (
          <FieldEditor key={item.id} {...props} item={item} />
        ))}
      </>
    );
  else if (domain === "daily_routine") body = <DayMap {...props} />;
  else if (domain === "strengths") body = <StrengthSlots {...props} />;
  else body = <NeedCards {...props} />;

  return (
    <div className="space-y-5 border-t border-line px-4 py-4 md:px-5">
      {state && (
        <div className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
          <ProvenanceBadges kinds={state.provenance} />
          {state.updated_at && (
            <span>{t("assessment.domain.savedBy", { name: state.updated_by_name ?? "", date: formatDate(state.updated_at) })}</span>
          )}
        </div>
      )}
      {readOnly && <Alert tone="info">{t("assessment.domain.readOnly")}</Alert>}
      {carried && !readOnly && (
        <Alert tone="tip">{t("assessment.domain.carried", { date: carried.filled_on ? formatDate(carried.filled_on) : "" })}</Alert>
      )}
      <DomainHints domain={domain} ctx={ctx} />
      {body}
      {warnings.length > 0 && (
        <Alert tone="warning" title={t("assessment.warnings.title")}>
          <ul className="list-disc space-y-1 ps-5">
            {[...new Set(warnings.map((w) => w.code))].map((code) => (
              <li key={code}>{t(code === "wording" ? "assessment.warnings.wording" : "assessment.warnings.strengths_below_3")}</li>
            ))}
          </ul>
        </Alert>
      )}
      {!readOnly && (
        <div className="space-y-3 border-t border-line pt-4">
          <StatusPicker label={t("assessment.domain.status")} value={status} onChange={setStatus} options={["in_progress", "sufficient", "review_later"]} />
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<Save aria-hidden />} loading={saving.pending} onClick={save}>
              {t("assessment.domain.save")}
            </Button>
            {dirty && <span className="text-caption text-ink-muted">{t("assessment.domain.unsaved")}</span>}
            <span className="flex-1" />
            {state && (
              <Button variant="ghost" icon={<History aria-hidden />} onClick={() => setHistoryOpen(true)}>
                {t("assessment.domain.history")}
              </Button>
            )}
          </div>
        </div>
      )}
      {readOnly && state && (
        <Button variant="ghost" icon={<History aria-hidden />} onClick={() => setHistoryOpen(true)}>
          {t("assessment.domain.history")}
        </Button>
      )}
      {historyOpen && <HistoryDialog cycleId={cycle.id} domain={domain} title={title} onClose={() => setHistoryOpen(false)} />}
      <FocusTitleDialog
        open={titleFor !== null}
        pending={promoting.pending}
        onClose={() => setTitleFor(null)}
        onSubmit={(title) => titleFor && void promote(titleFor.index, titleFor.need, title)}
      />
    </div>
  );
}

function FocusTitleDialog({ open, pending, onClose, onSubmit }: { open: boolean; pending: boolean; onClose: () => void; onSubmit: (title: string) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("assessment.needs.titleTitle")}
      description={t("assessment.needs.titleHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={pending} disabled={!title.trim()} onClick={() => onSubmit(title.trim())}>
            {t("assessment.needs.create")}
          </Button>
        </>
      }
    >
      <Field label={t("assessment.needs.titleLabel")}>
        {(p) => <Input {...p} dir="auto" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

function HistoryDialog({ cycleId, domain, title, onClose }: { cycleId: string; domain: Domain; title: string; onClose: () => void }) {
  const { t } = useI18n();
  const { formatDateTime } = useFormat();
  const { data, error } = useFetch<{ entries: Entry[] }>(historyUrl(cycleId, domain));
  return (
    <Dialog open onClose={onClose} title={t("assessment.domain.historyTitle", { name: title })} size="lg">
      {error ? (
        <Alert tone="error">{error.message}</Alert>
      ) : !data ? (
        <Skeleton className="h-24" />
      ) : data.entries.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("assessment.domain.historyEmpty")}</p>
      ) : (
        <ol className="space-y-3">
          {data.entries.map((e) => (
            <li key={e.id} className="space-y-2 rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-ink">{t("assessment.domain.savedBy", { name: e.entered_by_name ?? "", date: formatDateTime(e.entered_at) })}</span>
                <StatusPill status={e.status} />
              </div>
              <EntrySummary domain={domain} data={e.data} />
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

/** A compact read-only view of one saved domain document (labels, never scores). */
export function EntrySummary({ domain, data }: { domain: Domain; data: DomainData }) {
  const { t } = useI18n();
  const sm = useSourceModel();
  const { optionLabel } = useOptions();
  const lines: string[] = [];
  const reg = sm.items("observation_model", domain);
  const label = (kind: string, key: string) => {
    const item = reg.find((i) => i.kind === kind && (i.item_key === key || i.field === key));
    return item ? sm.label(item) : key;
  };
  if (data.items && !Array.isArray(data.items)) {
    for (const [key, r] of Object.entries(data.items)) {
      const rating = r as { level?: string; note?: string; effect?: string; reaction_text?: string };
      const value = rating.level
        ? t(`observations.supportLevels.${rating.level}`)
        : rating.effect
          ? optionLabel("sensory_effects", rating.effect)
          : "";
      const note = rating.note ?? rating.reaction_text;
      lines.push(`${label(domain === "sensory" ? "sensory_item" : "level_item", key)}${value ? `: ${value}` : ""}${note ? ` (${note})` : ""}`);
    }
  }
  if (Array.isArray(data.items)) {
    for (const s of data.items) lines.push(s.key ? optionLabel(s.list ?? "strengths", s.key) : (s.custom ?? ""));
  }
  for (const [key, stage] of Object.entries(data.stages ?? {})) {
    const parts = [stage.succeeds, stage.difficult].filter(Boolean).join(" · ");
    lines.push(`${label("stage", key)}${parts ? `: ${parts}` : ""}`);
  }
  for (const n of data.needs ?? []) lines.push(`${optionLabel("need_areas", n.area)}${n.seeing ? `: ${n.seeing}` : ""}`);
  for (const [key, v] of Object.entries(data.fields ?? {})) {
    const text = typeof v === "string" ? v : (v as { text?: string })?.text;
    if (text) lines.push(`${label("field", key)}: ${text}`);
  }
  if (!lines.length) return null;
  return (
    <ul className="space-y-0.5 text-sm text-ink">
      {lines.map((l, i) => (
        <li key={i} dir="auto">
          {l}
        </li>
      ))}
    </ul>
  );
}

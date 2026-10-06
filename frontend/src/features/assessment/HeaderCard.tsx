import { useState, type ReactNode } from "react";
import { Lock, Pencil, RotateCcw } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, Dialog, Field, Input, Textarea } from "@/components/ui";
import { NoteQuoteIcon } from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { closeCycle, updateHeader, type Assessment, type HeaderInput } from "./api";

export function cycleLabel(t: (k: string, v?: Record<string, string | number>) => string, c: Pick<Assessment, "kind" | "number">) {
  return c.kind === "initial" ? t("assessment.cycle.initial") : t("assessment.cycle.reassessment", { number: Math.max(1, (c.number ?? 2) - 1) });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption font-medium text-ink-muted">{label}</dt>
      <dd className="text-base text-ink">{children}</dd>
    </div>
  );
}

/**
 * Section א of the observation model: the child snapshot taken with this cycle (age at the
 * fill date), the cycle, the fill date, the observation period, the teacher and who filled
 * it in. Open cycles can be edited and closed; a closed one is kept as it is.
 */
export function HeaderCard({
  cycle,
  canReassess,
  onChanged,
  onReassess,
}: {
  cycle: Assessment;
  /** The closed cycle is the latest one, so a reassessment can start from it. */
  canReassess: boolean;
  onChanged: (a: Assessment) => void;
  onReassess: () => void;
}) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const [editOpen, setEditOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const closing = useAction();
  const snap = cycle.child_snapshot ?? {};
  const age = snap.age_at_fill;
  const ageText = age
    ? [age.years > 0 ? t("common.age.years", { count: age.years }) : "", age.months > 0 || age.years === 0 ? t("common.age.months", { count: age.months }) : ""]
        .filter(Boolean)
        .join(" ")
    : null;
  const notSet = t("assessment.header.notSet");
  const period =
    cycle.period_from || cycle.period_to
      ? t("assessment.header.periodRange", {
          from: cycle.period_from ? formatDate(cycle.period_from) : "…",
          to: cycle.period_to ? formatDate(cycle.period_to) : "…",
        })
      : notSet;
  const open = cycle.status === "open";

  async function close() {
    const r = await closing.run(() => closeCycle(cycle.id), { success: t("assessment.header.closed") });
    if (r.ok) {
      setCloseOpen(false);
      onChanged(r.data.assessment);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<NoteQuoteIcon />}
        title={t("assessment.header.title")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{cycleLabel(t, cycle)}</Badge>
            <Badge tone={open ? "neutral" : "muted"} icon={open ? undefined : <Lock aria-hidden />}>
              {t(open ? "assessment.cycle.open" : "assessment.cycle.closed")}
            </Badge>
          </span>
        }
      />
      <CardBody>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Row label={t("assessment.header.name")}>
            <bdi>{snap.name ?? notSet}</bdi>
          </Row>
          <Row label={t("assessment.header.age")}>{ageText ?? notSet}</Row>
          <Row label={t("assessment.header.birthDate")}>{snap.birth_date ? <bdi className="tabular">{formatDate(snap.birth_date)}</bdi> : notSet}</Row>
          <Row label={t("assessment.header.kindergarten")}>
            <bdi>{snap.kindergarten ?? notSet}</bdi>
            {snap.class_name && <span className="text-ink-muted"> · <bdi>{snap.class_name}</bdi></span>}
          </Row>
          <Row label={t("assessment.header.teacher")}>
            <bdi>{cycle.teacher_name ?? snap.teacher_name ?? notSet}</bdi>
          </Row>
          <Row label={t("assessment.header.filledOn")}>
            <bdi className="tabular">{formatDate(cycle.filled_on)}</bdi>
          </Row>
          <Row label={t("assessment.header.period")}>
            <bdi className="tabular">{period}</bdi>
            {cycle.period_note && (
              <span className="block text-sm text-ink-muted" dir="auto">
                {cycle.period_note}
              </span>
            )}
          </Row>
          <Row label={t("assessment.header.filledBy")}>
            <span dir="auto">{cycle.filled_by_text || cycle.created_by_name || notSet}</span>
          </Row>
          {!open && cycle.closed_at && (
            <Row label={t("assessment.header.closedOn")}>
              <bdi className="tabular">{formatDate(cycle.closed_at)}</bdi>
            </Row>
          )}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {open && (
            <>
              <Button variant="secondary" icon={<Pencil aria-hidden />} onClick={() => setEditOpen(true)}>
                {t("assessment.header.edit")}
              </Button>
              <Button variant="ghost" icon={<Lock aria-hidden />} onClick={() => setCloseOpen(true)}>
                {t("assessment.header.close")}
              </Button>
            </>
          )}
          {!open && canReassess && (
            <Button variant="secondary" icon={<RotateCcw aria-hidden />} onClick={onReassess}>
              {t("assessment.header.reassess")}
            </Button>
          )}
        </div>
      </CardBody>
      {editOpen && <EditHeaderDialog cycle={cycle} onClose={() => setEditOpen(false)} onSaved={onChanged} />}
      <Dialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title={t("assessment.header.closeTitle")}
        description={t("assessment.header.closeBody")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button loading={closing.pending} onClick={close}>
              {t("assessment.header.closeConfirm")}
            </Button>
          </>
        }
      />
    </Card>
  );
}

function EditHeaderDialog({ cycle, onClose, onSaved }: { cycle: Assessment; onClose: () => void; onSaved: (a: Assessment) => void }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [form, setForm] = useState({
    filled_on: cycle.filled_on,
    period_from: cycle.period_from ?? "",
    period_to: cycle.period_to ?? "",
    period_note: cycle.period_note ?? "",
    filled_by_text: cycle.filled_by_text ?? "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const badPeriod = !!form.period_from && !!form.period_to && form.period_from > form.period_to;

  async function save() {
    const body: HeaderInput = {
      ...(form.filled_on ? { filled_on: form.filled_on } : {}),
      period_from: form.period_from || null,
      period_to: form.period_to || null,
      period_note: form.period_note.trim() || null,
      filled_by_text: form.filled_by_text.trim() || null,
    };
    const r = await run(() => updateHeader(cycle.id, body), { success: t("assessment.header.saved") });
    if (r.ok) {
      onSaved(r.data.assessment);
      onClose();
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("assessment.header.editTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={pending} disabled={badPeriod} onClick={save}>
            {t("assessment.header.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("assessment.header.filledOn")}>
          {(p) => <Input {...p} type="date" dir="ltr" value={form.filled_on} onChange={(e) => set("filled_on", e.target.value)} />}
        </Field>
        <div className="hidden sm:block" />
        <Field label={t("assessment.header.periodFrom")}>
          {(p) => <Input {...p} type="date" dir="ltr" value={form.period_from} onChange={(e) => set("period_from", e.target.value)} />}
        </Field>
        <Field label={t("assessment.header.periodTo")} error={badPeriod ? t("assessment.header.periodOrder") : undefined}>
          {(p) => <Input {...p} type="date" dir="ltr" value={form.period_to} onChange={(e) => set("period_to", e.target.value)} />}
        </Field>
        <Field label={t("assessment.header.periodNote")} className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} maxLength={500} value={form.period_note} onChange={(e) => set("period_note", e.target.value)} />}
        </Field>
        <Field label={t("assessment.header.filledBy")} className="sm:col-span-2">
          {(p) => <Input {...p} dir="auto" maxLength={200} value={form.filled_by_text} onChange={(e) => set("filled_by_text", e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

/** Start the first cycle or a reassessment (optionally starting from the earlier answers). */
export function StartCycleDialog({
  open,
  reassessment,
  pending,
  onClose,
  onStart,
}: {
  open: boolean;
  reassessment: boolean;
  pending: boolean;
  onClose: () => void;
  onStart: (copyForward: boolean) => void;
}) {
  const { t } = useI18n();
  const [copy, setCopy] = useState(true);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t(reassessment ? "assessment.header.reassessTitle" : "assessment.empty.start")}
      description={t(reassessment ? "assessment.header.reassessBody" : "assessment.empty.body")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={pending} onClick={() => onStart(reassessment && copy)}>
            {t(reassessment ? "assessment.header.reassess" : "assessment.empty.start")}
          </Button>
        </>
      }
    >
      {reassessment && <Checkbox label={t("assessment.header.copyForward")} checked={copy} onChange={(e) => setCopy(e.target.checked)} />}
    </Dialog>
  );
}

/**
 * /family/:id/routines: picture schedules for a part of the day (parents and staff of the child).
 * Each routine shows as big, printable cards in order; the child taps a card when a step is done
 * (kept on this screen only). Make one from a preset (morning, bedtime, arriving at kindergarten)
 * or from scratch, and edit the steps: an emoji and a short label each.
 */
import { useState } from "react";
import { useParams } from "react-router";
import { ArrowDown, ArrowUp, CalendarClock, Plus, Printer, Trash2 } from "lucide-react";
import { Alert, Button, Card, CardBody, CardFooter, EmptyState, Field, IconButton, Input, PageHeader, PageSkeleton, Select, ToggleChip } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { api, isApiError } from "@/lib/api";
import { paths } from "@/lib/paths";
import { useAuth } from "@/auth/AuthProvider";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";

type Step = { emoji: string; label: string };
type Routine = { id: string; child_id: string; title: string; steps: Step[]; created_by_role: string };
type Presets = { presets: { key: string; title: string; steps: Step[] }[]; emojis: string[] };
type Draft = { id?: string; title: string; steps: Step[] };

const enc = encodeURIComponent;

export function RoutinesPage() {
  const { id = "" } = useParams();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { data, loading, reload } = useFetch<{ routines: Routine[] }>(`/api/children/${enc(id)}/routines`);
  const presets = useFetch<Presets>(`/api/routine-presets?language=${locale}`).data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const routines = data?.routines ?? [];
  const back = user?.role === "parent" ? paths.parentHome() : paths.child(id);

  if (loading && !data) return <PageSkeleton />;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        back={{ to: back, label: t("common.back") }}
        icon={<CalendarClock />}
        title={t("family.routines.title")}
        description={t("family.routines.subtitle")}
        actions={
          !draft && (
            <Button icon={<Printer aria-hidden />} variant="outline" onClick={() => window.print()}>
              {t("family.routines.print")}
            </Button>
          )
        }
      />
      {draft ? (
        <RoutineEditor childId={id} draft={draft} emojis={presets?.emojis ?? []} onDone={() => { setDraft(null); reload(); }} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 print:hidden" data-testid="routine-new">
            {(presets?.presets ?? []).map((p) => (
              <Button key={p.key} size="sm" variant="secondary" icon={<Plus aria-hidden />} onClick={() => setDraft({ title: p.title, steps: p.steps })}>
                {p.title}
              </Button>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus aria-hidden />} onClick={() => setDraft({ title: "", steps: [{ emoji: "🌞", label: "" }, { emoji: "🏠", label: "" }] })}>
              {t("family.routines.blank")}
            </Button>
          </div>
          {routines.length === 0 ? (
            <EmptyState title={t("family.routines.empty")} description={t("family.routines.emptyHint")} />
          ) : (
            routines.map((r) => <Schedule key={r.id} routine={r} onEdit={() => setDraft({ id: r.id, title: r.title, steps: r.steps })} />)
          )}
        </>
      )}
    </div>
  );
}

function Schedule({ routine, onEdit }: { routine: Routine; onEdit: () => void }) {
  const { t } = useI18n();
  const [done, setDone] = useState<number[]>([]);
  const toggle = (i: number) => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
  return (
    <Card className="ks-print-area" data-testid="routine">
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-title font-semibold text-ink" dir="auto">
            {routine.title}
          </h2>
          <Button size="sm" variant="ghost" className="print:hidden" onClick={onEdit}>
            {t("common.edit")}
          </Button>
        </div>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {routine.steps.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                aria-pressed={done.includes(i)}
                onClick={() => toggle(i)}
                className={cn(
                  "ks-press flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-[1.5px] p-3 text-center",
                  done.includes(i) ? "border-brand bg-brand-soft" : "border-line-strong bg-surface",
                )}
              >
                <span className="tabular text-caption text-ink-muted">{i + 1}</span>
                <span className="text-5xl" aria-hidden>
                  {s.emoji}
                </span>
                <span className="text-lg font-semibold text-ink" dir="auto">
                  {s.label}
                </span>
                {done.includes(i) && <span className="text-caption font-semibold text-brand">{t("family.routines.done")}</span>}
              </button>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}

function RoutineEditor({ childId, draft, emojis, onDone }: { childId: string; draft: Draft; emojis: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const { run, pending } = useAction();
  const [title, setTitle] = useState(draft.title);
  const [steps, setSteps] = useState<Step[]>(draft.steps);
  const [problem, setProblem] = useState<string | null>(null);
  const setStep = (i: number, s: Partial<Step>) => setSteps((all) => all.map((x, k) => (k === i ? { ...x, ...s } : x)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((all) => {
      const next = [...all];
      const j = i + d;
      if (j < 0 || j >= next.length) return all;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const valid = title.trim() && steps.length >= 2 && steps.every((s) => s.label.trim() && s.emoji);

  async function save() {
    setProblem(null);
    const body = { title: title.trim(), steps: steps.map((s) => ({ emoji: s.emoji, label: s.label.trim() })) };
    const r = await run(
      () => (draft.id ? api(`/api/routines/${enc(draft.id)}`, { method: "PUT", body }) : api(`/api/children/${enc(childId)}/routines`, { method: "POST", body })),
      { success: t("family.routines.saved"), errorToast: false, onError: (e) => setProblem(isApiError(e, "UNSAFE_CONTENT") ? t("family.routines.wording") : t("family.routines.notSaved")) },
    );
    if (r.ok) onDone();
  }
  async function remove() {
    if (!draft.id) return;
    const r = await run(() => api(`/api/routines/${enc(draft.id!)}`, { method: "DELETE" }), { success: t("family.routines.deleted") });
    if (r.ok) onDone();
  }

  return (
    <Card data-testid="routine-editor">
      <CardBody className="space-y-4">
        <Field label={t("family.routines.name")}>{(p) => <Input {...p} dir="auto" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <Field label={t("family.routines.picture")} className="w-24">
                {(p) => (
                  <Select {...p} value={s.emoji} onChange={(e) => setStep(i, { emoji: e.target.value })}>
                    {Array.from(new Set([s.emoji, ...emojis])).map((em) => (
                      <option key={em} value={em}>
                        {em}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t("family.routines.step", { n: i + 1 })} className="min-w-40 flex-1">
                {(p) => <Input {...p} dir="auto" maxLength={60} value={s.label} onChange={(e) => setStep(i, { label: e.target.value })} />}
              </Field>
              <IconButton label={t("family.routines.up")} onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp aria-hidden />
              </IconButton>
              <IconButton label={t("family.routines.down")} onClick={() => move(i, 1)} disabled={i === steps.length - 1}>
                <ArrowDown aria-hidden />
              </IconButton>
              <IconButton label={t("family.routines.removeStep")} onClick={() => setSteps((all) => all.filter((_, k) => k !== i))} disabled={steps.length <= 2}>
                <Trash2 aria-hidden />
              </IconButton>
            </li>
          ))}
        </ol>
        {steps.length < 12 && (
          <ToggleChip selected={false} onToggle={() => setSteps((all) => [...all, { emoji: emojis[0] ?? "🌞", label: "" }])} icon={<Plus className="size-4" aria-hidden />}>
            {t("family.routines.addStep")}
          </ToggleChip>
        )}
        {problem && <Alert tone="warning">{problem}</Alert>}
      </CardBody>
      <CardFooter className="justify-between gap-2">
        <div>
          {draft.id && (
            <Button variant="ghost" icon={<Trash2 aria-hidden />} onClick={remove} disabled={pending}>
              {t("family.routines.delete")}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={!valid} loading={pending}>
            {t("common.save")}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

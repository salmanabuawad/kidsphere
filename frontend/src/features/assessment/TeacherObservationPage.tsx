import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { ClipboardList } from "lucide-react";
import { Alert, Button, EmptyState, Select, Skeleton } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { useSourceModel } from "@/lib/sourceModel";
import { ChildLayout } from "@/features/children";
import { DOMAINS, assessmentUrl, cyclesUrl, startCycle, type Assessment, type CyclesResponse, type Domain, type DomainSaved } from "./api";
import { DomainCard } from "./DomainCard";
import { GuideCard } from "./GuideCard";
import { NextQuestionsCard } from "./NextQuestionsCard";
import { HeaderCard, StartCycleDialog, cycleLabel } from "./HeaderCard";
import type { ParentSections } from "./parentHints";

type ProfileResponse = {
  parent_perspective?: { sections?: ParentSections };
  /** Staff only: the quick baseline's "first area to observe" (TP.bridge, PQ-TCH-06) is highlighted. */
  teacher_perspective?: { sections?: { bridge?: { first_area_to_observe?: { domain?: string | null } | null } } };
};

/**
 * Teacher Observation tab (COVERAGE-MATRIX §5.5): the full observation filled in gradually,
 * one section at a time. Header (section א), "How to observe", and the 13 section cards with
 * status pills (one open at a time, ?domain=); earlier cycles open read-only (?cycle=).
 */
export function TeacherObservationPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const toMessage = useErrorMessage();
  const sm = useSourceModel();
  const [params, setParams] = useSearchParams();
  const cycles = useFetch<CyclesResponse>(cyclesUrl(id));
  const current = cycles.data?.current ?? null;
  const cycleParam = params.get("cycle");
  const pickedId = cycleParam && cycleParam !== current?.id ? cycleParam : null;
  const picked = useFetch<{ assessment: Assessment }>(pickedId ? assessmentUrl(pickedId) : null);
  const cycle = pickedId ? picked.data?.assessment : current;
  const profile = useFetch<ProfileResponse>(`/api/children/${encodeURIComponent(id)}/profile`);
  const parentSections = profile.data?.parent_perspective?.sections ?? {};
  const firstArea = profile.data?.teacher_perspective?.sections?.bridge?.first_area_to_observe?.domain ?? null;
  const [startOpen, setStartOpen] = useState(false);
  const starting = useAction();
  const openParam = params.get("domain");
  const openDomain = (DOMAINS as readonly string[]).includes(openParam ?? "") ? (openParam as Domain) : null;

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  function replaceCycle(a: Assessment) {
    if (pickedId && a.id === pickedId) picked.setData({ assessment: a });
    else cycles.setData((prev) => ({ current: a, earlier: prev?.earlier ?? [] }));
  }

  function domainSaved(saved: DomainSaved) {
    if (!cycle) return;
    replaceCycle({
      ...cycle,
      domains: {
        ...cycle.domains,
        [saved.domain]: {
          status: saved.status,
          data: saved.data,
          entry_id: saved.entry_id,
          updated_at: saved.updated_at,
          updated_by: null,
          updated_by_name: saved.updated_by_name,
          provenance: saved.provenance,
        },
      },
    });
  }

  async function start(copyForward: boolean) {
    const r = await starting.run(() => startCycle(id, copyForward ? { copy_forward: true } : {}), { success: t("assessment.header.started") });
    if (r.ok) {
      setStartOpen(false);
      setParam("cycle", null);
      cycles.reload();
    }
  }

  const all = current ? [current, ...(cycles.data?.earlier ?? [])] : (cycles.data?.earlier ?? []);
  const reassessment = all.length > 0;
  const loading = (!cycles.data && !cycles.error) || (pickedId && !picked.data && !picked.error);
  const error = cycles.error ?? picked.error;

  return (
    <ChildLayout childId={id}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-title font-semibold text-ink">{t("assessment.title")}</h2>
            <p className="max-w-2xl text-base text-ink-muted">{t("assessment.intro")}</p>
          </div>
          {all.length > 1 && (
            <div className="w-full sm:w-72">
              <Select aria-label={t("assessment.cycle.switch")} value={cycle?.id ?? ""} onChange={(e) => setParam("cycle", e.target.value === current?.id ? null : e.target.value)}>
                {all.map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${cycleLabel(t, c)} · ${formatDate(c.filled_on)}${c.status === "closed" ? ` · ${t("assessment.cycle.closed")}` : ""}`}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {error ? (
          <Alert
            tone="error"
            action={
              <Button size="sm" variant="outline" onClick={cycles.reload}>
                {t("common.retry")}
              </Button>
            }
          >
            {toMessage(error)}
          </Alert>
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : !cycle ? (
          <>
            <EmptyState
              icon={<ClipboardList aria-hidden />}
              title={t("assessment.empty.title")}
              description={t("assessment.empty.body")}
              action={
                <Button loading={starting.pending} onClick={() => void start(false)}>
                  {t("assessment.empty.start")}
                </Button>
              }
            />
            <GuideCard />
          </>
        ) : (
          <>
            <HeaderCard
              cycle={cycle}
              canReassess={cycle.status === "closed" && cycle.id === current?.id}
              onChanged={replaceCycle}
              onReassess={() => setStartOpen(true)}
            />
            <GuideCard />
            {cycle.status === "open" && <NextQuestionsCard childId={id} childName={cycle.child_snapshot?.preferred_name || cycle.child_snapshot?.name || ""} />}
            {cycle.status === "closed" && (
              <Alert tone="info">{t("assessment.header.closedNote", { date: cycle.closed_at ? formatDate(cycle.closed_at) : "" })}</Alert>
            )}
            {sm.error && <Alert tone="error">{toMessage(sm.error)}</Alert>}
            <section aria-label={t("assessment.domains")} className="space-y-3">
              {DOMAINS.map((d) => (
                <DomainCard
                  key={d}
                  domain={d}
                  cycle={cycle}
                  childId={id}
                  open={openDomain === d}
                  onToggle={() => setParam("domain", openDomain === d ? null : d)}
                  parentSections={parentSections}
                  firstArea={firstArea === d}
                  onSaved={domainSaved}
                  onFocusCreated={() => (pickedId ? picked.reload() : cycles.reload())}
                />
              ))}
            </section>
          </>
        )}
        <StartCycleDialog open={startOpen} reassessment={reassessment} pending={starting.pending} onClose={() => setStartOpen(false)} onStart={(copy) => void start(copy)} />
      </div>
    </ChildLayout>
  );
}

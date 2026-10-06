import type { ReactNode } from "react";
import { BadgeCheck, Eye, Home, Sparkles } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/Badge";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { interpolateNodes } from "./interpolate";

/**
 * Where a piece of child information comes from (X-22). The four perspectives stay
 * distinct and are never merged into an anonymous profile. The labels are derived by
 * the backend (app/provenance.py → `provenance[]` on profile items, reviews, summaries
 * and assessments) and listed as `provenance` in GET /api/options.
 */
export const PROVENANCE_KINDS = ["parent_said", "teacher_observed", "ai_suggested", "teacher_approved"] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export function isProvenanceKind(v: unknown): v is ProvenanceKind {
  return typeof v === "string" && (PROVENANCE_KINDS as readonly string[]).includes(v);
}

const LOOK: Record<ProvenanceKind, { tone: Tone; icon: ReactNode }> = {
  parent_said: { tone: "outline", icon: <Home aria-hidden /> },
  teacher_observed: { tone: "neutral", icon: <Eye aria-hidden /> },
  ai_suggested: { tone: "brand", icon: <Sparkles aria-hidden /> },
  teacher_approved: { tone: "success", icon: <BadgeCheck aria-hidden /> },
};

/**
 * A visible text chip ("Parent said", "Teacher observed", "AI suggested", "Teacher
 * approved"): readable on touch screens, never a hover-only tooltip. Screen readers
 * hear "Source: …". `enteredBy` adds "Entered by {name}" (with the date when given,
 * and "In a meeting with the family" for mode=meeting), e.g. for parent answers that
 * a staff member typed in.
 */
export function ProvenanceBadge({
  kind,
  enteredBy,
  enteredAt,
  mode,
  className,
}: {
  kind: ProvenanceKind;
  /** Display name of the person who typed it in, when that is not the source itself. */
  enteredBy?: string | null;
  /** ISO date or datetime of the entry; shown only together with enteredBy. */
  enteredAt?: string | Date | null;
  /** The entry mode of the stamp (self | on_behalf | meeting); only "meeting" adds words. */
  mode?: string | null;
  className?: string;
}) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const look = LOOK[kind];
  const by = enteredBy?.trim();
  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 align-middle", className)} data-provenance={kind}>
      <Badge tone={look.tone} icon={look.icon}>
        <span className="sr-only">{t("common.provenance.label")}: </span>
        {t(`common.provenance.${kind}`)}
      </Badge>
      {by && (
        <span className="text-caption text-ink-muted" data-entered-by="">
          {interpolateNodes(t(enteredAt ? "common.provenance.enteredByOn" : "common.provenance.enteredBy"), {
            name: <bdi>{by}</bdi>,
            date: enteredAt ? <bdi className="tabular">{formatDate(enteredAt)}</bdi> : null,
          })}
          {mode === "meeting" && ` · ${t("common.provenance.inMeeting")}`}
        </span>
      )}
    </span>
  );
}

/**
 * One element of an API `provenance[]`: a label (app.provenance.derive) or a badge
 * object (app.provenance.badges: {label, entered_by?, mode?, at?}).
 */
export type ProvenanceEntry = string | { label: string; entered_by?: string | null; mode?: string | null; at?: string | null };

/**
 * The badges for an item's `provenance[]`, de-duplicated and in canonical order
 * (the first entry of a label wins). Unknown labels are skipped; renders nothing for
 * an empty list.
 */
export function ProvenanceBadges({ kinds, className }: { kinds?: readonly ProvenanceEntry[] | null; className?: string }) {
  const byLabel = new Map<string, Exclude<ProvenanceEntry, string>>();
  for (const e of kinds ?? []) {
    const entry = typeof e === "string" ? { label: e } : e;
    if (entry && isProvenanceKind(entry.label) && !byLabel.has(entry.label)) byLabel.set(entry.label, entry);
  }
  const known = PROVENANCE_KINDS.filter((k) => byLabel.has(k));
  if (!known.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {known.map((k) => {
        const e = byLabel.get(k)!;
        return <ProvenanceBadge key={k} kind={k} enteredBy={e.entered_by} enteredAt={e.at} mode={e.mode} />;
      })}
    </span>
  );
}

import { isProvenanceKind, type ProvenanceEntry, type ProvenanceKind } from "@/components/source";
import type { EnteredStamp, ProfileItem } from "./types";

/** Item `sources` → provenance label, as app/provenance.py derives it (X-22). */
const SOURCE_LABELS: Record<string, ProvenanceKind> = {
  parent: "parent_said",
  teacher: "teacher_observed",
  observation: "teacher_observed",
  review: "teacher_approved",
};

const STAFF_ROLES = new Set(["admin", "teacher"]);

/** Labels from `sources` (the client fallback when the API sent no `provenance[]`). */
export function deriveFromSources(sources: readonly string[] | null | undefined): ProvenanceKind[] {
  const found = new Set<ProvenanceKind>();
  for (const s of sources ?? []) {
    const label = SOURCE_LABELS[s];
    if (label) found.add(label);
  }
  return [...found];
}

/** The provenance of a merged profile item: the API `provenance[]` when present, else derived from `sources`. */
export function itemProvenance(item: ProfileItem): ProvenanceEntry[] {
  if (Array.isArray(item.provenance)) return item.provenance;
  return deriveFromSources(item.sources);
}

/** Just the labels of a provenance list (compact chips leave out "entered by"). */
export function provenanceLabels(entries: readonly ProvenanceEntry[]): ProvenanceKind[] {
  const out: ProvenanceKind[] = [];
  for (const e of entries) {
    const label = typeof e === "string" ? e : e?.label;
    if (isProvenanceKind(label) && !out.includes(label)) out.push(label);
  }
  return out;
}

/** The latest `entered` stamp of a section, if any. */
export function lastStamp(stamps: readonly EnteredStamp[] | null | undefined): EnteredStamp | null {
  if (!Array.isArray(stamps) || stamps.length === 0) return null;
  return stamps[stamps.length - 1] ?? null;
}

/**
 * PARENT SAID for a parent answer; when staff typed it for the family, the badge says
 * "Entered by {name}" (and "in a meeting with the family" for meeting mode).
 */
export function parentSaid(stamp: EnteredStamp | null): ProvenanceEntry {
  if (stamp && stamp.role && STAFF_ROLES.has(stamp.role) && stamp.by_name)
    return { label: "parent_said", entered_by: stamp.by_name, mode: stamp.mode ?? null, at: stamp.at ?? null };
  return "parent_said";
}

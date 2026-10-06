/**
 * "Parent said" hints on the Teacher Observation tab: what the family answered in the
 * questionnaire next to the matching teacher item (COVERAGE-MATRIX OM-D01-04, D04-09,
 * D08-00 …). They are shown beside the teacher's own answer with a PARENT SAID badge and
 * never copied into it. The newer questionnaire keys come first, then the earlier form's.
 */
import type { Domain } from "./api";

export type ParentSections = Record<string, Record<string, unknown> | undefined>;
export type OptionLabel = (list: string, key: string) => string;
type Source = { path: string; list: string };

const TRANSITIONS: Source[] = [
  { path: "transitions.stopping_activity", list: "pq_stop_activity" },
  { path: "emotions.transition_reaction", list: "transition_reactions" },
];
const CONTACT: Source[] = [
  { path: "social.contact_pq", list: "pq_social_contact" },
  { path: "social.social", list: "social" },
];

const ITEM_HINTS: Record<string, Source[]> = {
  "emotional.copes_with_separation": [
    { path: "separation.morning", list: "pq_morning_separation" },
    { path: "emotions.morning_separation", list: "morning_separation" },
  ],
  "emotional.accepts_routine_change": TRANSITIONS,
  "executive_function.moves_between_activities": TRANSITIONS,
  "executive_function.accepts_change": TRANSITIONS,
  "social.initiates_contact": CONTACT,
  "social.joins_existing_play": CONTACT,
  "language.expresses_needs_in_words": [
    { path: "communication.expresses_needs", list: "pq_express_needs" },
    { path: "social.communication", list: "communication" },
  ],
};

/** Domain-level hints: {key of assessment.hints.*, sources}. */
const DOMAIN_HINTS: Partial<Record<Domain, { key: string; sources: Source[] }[]>> = {
  emotional: [
    { key: "calming", sources: [{ path: "emotions.calming_helps", list: "calming_helps" }] },
    {
      key: "frustration",
      sources: [
        { path: "emotions.frustration_pq", list: "pq_frustration_reactions" },
        { path: "emotions.frustration_reactions", list: "frustration_reactions" },
      ],
    },
  ],
  social: [{ key: "social", sources: CONTACT }],
  play: [{ key: "interests", sources: [{ path: "who.interests", list: "interests" }] }],
  sensory: [{ key: "environment", sources: [{ path: "environment.items", list: "sensitivities" }] }],
  strengths: [{ key: "strengths", sources: [{ path: "who.strengths", list: "strengths" }] }],
};

function get(sections: ParentSections, path: string): unknown {
  const [section, ...rest] = path.split(".");
  let cur: unknown = sections[section!];
  for (const part of rest) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Labels of a stored answer: a key, a list of keys / {key} / {custom}, or {selected[], other}. */
export function answerLabels(value: unknown, list: string, label: OptionLabel): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return value.trim() ? [label(list, value)] : [];
  if (Array.isArray(value)) return value.flatMap((v) => answerLabels(v, list, label));
  if (typeof value === "object") {
    const o = value as { key?: unknown; custom?: unknown; selected?: unknown; other?: unknown };
    if (typeof o.key === "string" && o.key) return [label(list, o.key)];
    if (typeof o.custom === "string" && o.custom.trim()) return [o.custom.trim()];
    if (Array.isArray(o.selected) || typeof o.selected === "string") {
      const other = typeof o.other === "string" && o.other.trim() ? [o.other.trim()] : [];
      return [...answerLabels(o.selected, list, label), ...other];
    }
  }
  return [];
}

function first(sources: Source[], sections: ParentSections, label: OptionLabel): string[] {
  for (const s of sources) {
    const values = answerLabels(get(sections, s.path), s.list, label);
    if (values.length) return [...new Set(values)];
  }
  return [];
}

export function itemHint(domain: Domain, itemKey: string, sections: ParentSections, label: OptionLabel): string[] {
  const sources = ITEM_HINTS[`${domain}.${itemKey}`];
  return sources ? first(sources, sections, label) : [];
}

export function domainHints(domain: Domain, sections: ParentSections, label: OptionLabel): { key: string; values: string[] }[] {
  return (DOMAIN_HINTS[domain] ?? []).map((h) => ({ key: h.key, values: first(h.sources, sections, label) })).filter((h) => h.values.length);
}

/**
 * The parent's independence answer for one area: "independent" | "needs_help" from the
 * questionnaire (levels_pq), else the earlier form's support level. Null when not answered.
 */
export function independenceHint(area: string, sections: ParentSections): { binary?: "independent" | "needs_help"; level?: string } | null {
  const pq = get(sections, `independence.levels_pq.${area}`);
  if (pq === "independent" || pq === "needs_help") return { binary: pq };
  const level = get(sections, `independence.levels.${area}`);
  return typeof level === "string" && level ? { level } : null;
}

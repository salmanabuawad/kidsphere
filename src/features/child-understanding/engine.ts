/**
 * Child Understanding Engine — deterministic rules (no I/O).
 *
 * Inputs (parent answers, teacher observations, outcomes) are converted into
 * normalized attribute *candidates*. Application logic in
 * server/services/profile.ts decides whether candidates create or update
 * canonical attributes. An LLM may only ever contribute pending suggestions.
 */
import type { AttributeCategory, AttributeStatus, ConfidenceLevel, EvidenceSource } from "@prisma/client";
import { isKnownValue } from "./vocabulary";

export type Candidate = { category: AttributeCategory; value: string };

export type EvidenceLike = { sourceType: EvidenceSource; sourceId: string };

/**
 * Confidence from evidence:
 *  - RETIRED   attribute retired/rejected by a teacher
 *  - EMERGING  pending teacher confirmation, or supported only by AI suggestion
 *  - CORROBORATED  parent + teacher evidence, or ≥2 independent teacher observations/outcomes
 *  - OBSERVED  one direct teacher observation (or a helped outcome)
 *  - REPORTED  single parent report or teacher entry
 */
export function computeConfidence(evidence: EvidenceLike[], status: AttributeStatus): ConfidenceLevel {
  if (status === "RETIRED" || status === "REJECTED") return "RETIRED";
  if (status === "PENDING_CONFIRMATION") return "EMERGING";

  const distinct = (type: EvidenceSource) => new Set(evidence.filter((e) => e.sourceType === type).map((e) => e.sourceId)).size;
  const parent = distinct("PARENT_QUESTIONNAIRE");
  const direct = distinct("TEACHER_OBSERVATION") + distinct("OUTCOME");
  const teacherEntry = distinct("TEACHER_ENTRY");

  if ((parent > 0 && direct > 0) || direct >= 2) return "CORROBORATED";
  if (direct >= 1) return "OBSERVED";
  if (parent > 0 || teacherEntry > 0) return "REPORTED";
  return "EMERGING";
}

/**
 * Status transition when new evidence arrives.
 * - new attribute: pending evidence → PENDING_CONFIRMATION, otherwise ACTIVE
 * - pending attribute becomes ACTIVE only through direct teacher evidence
 *   (a teacher observation that is not itself a "possible pattern") or confirmation
 * - RETIRED / REJECTED are teacher decisions and are never reversed automatically
 */
export function nextStatus(current: AttributeStatus | null, incoming: { sourceType: EvidenceSource; pending: boolean }): AttributeStatus {
  if (current === null) return incoming.pending ? "PENDING_CONFIRMATION" : "ACTIVE";
  if (current === "PENDING_CONFIRMATION") {
    const direct = !incoming.pending && (incoming.sourceType === "TEACHER_OBSERVATION" || incoming.sourceType === "OUTCOME");
    return direct ? "ACTIVE" : "PENDING_CONFIRMATION";
  }
  return current;
}

type MultiAnswer = { selected?: string[]; other?: string | null };

function selected(answers: Record<string, unknown>, key: string): string[] {
  const v = answers[key] as MultiAnswer | undefined;
  return Array.isArray(v?.selected) ? v!.selected!.filter((s) => s !== "other") : [];
}

function single(answers: Record<string, unknown>, key: string): string | undefined {
  const v = answers[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

const SENSORY_MAP: Record<string, { sensory: string; trigger?: string }> = {
  noise: { sensory: "noise_sensitive", trigger: "loud_surprise_sounds" },
  touch: { sensory: "touch_sensitive" },
  clothing: { sensory: "clothing_sensitive" },
  dirt: { sensory: "dirt_avoidant", trigger: "messy_textures" },
  smells: { sensory: "smell_sensitive", trigger: "strong_smells" },
  textures: { sensory: "texture_sensitive", trigger: "messy_textures" },
  light: { sensory: "light_sensitive", trigger: "bright_lights" },
  crowding: { sensory: "crowd_sensitive", trigger: "crowding" },
};

/** Parent questionnaire → REPORTED candidates. Sensitive (health) answers are never read here. */
export function questionnaireCandidates(answers: Record<string, unknown>): Candidate[] {
  const out: Candidate[] = [];
  const add = (category: AttributeCategory, value: string) => {
    if (isKnownValue(category, value)) out.push({ category, value });
  };

  selected(answers, "strengths_seen").forEach((v) => add("STRENGTH", v));
  selected(answers, "interests").forEach((v) => add("INTEREST", v));
  selected(answers, "calming_supports").forEach((v) => add("SUPPORT", v));
  selected(answers, "social_style").forEach((v) => add("SOCIAL_INTERACTION", v));
  selected(answers, "communicates_needs").forEach((v) => add("COMMUNICATION", v));
  selected(answers, "home_languages").forEach((v) => add("LANGUAGE", v));
  selected(answers, "feel").forEach((v) => add("FAMILY_PRIORITY", v));

  if (single(answers, "enjoys_recounting") === "yes") add("COMMUNICATION", "enjoys_recounting");

  for (const s of selected(answers, "sensory_reactions")) {
    const m = SENSORY_MAP[s];
    if (!m) continue;
    add("SENSORY", m.sensory);
    if (m.trigger) add("TRIGGER", m.trigger);
  }

  const stopping = single(answers, "stopping_activity");
  const prepHelps = single(answers, "preparation_helps");
  if (stopping && stopping !== "easy") {
    add("TRIGGER", "stopping_preferred_activity");
    if (prepHelps === "yes" || prepHelps === "sometimes") add("EMOTIONAL_REGULATION", "needs_preparation_for_change");
  }
  if (prepHelps !== "no") selected(answers, "preparation_what").forEach((v) => add("SUPPORT", v));

  const separation = single(answers, "separation");
  if (separation === "very_difficult") add("TRIGGER", "separation");

  const transitionObject = answers["transition_object"];
  if (typeof transitionObject === "string" && transitionObject.trim().length > 0) add("SUPPORT", "transition_object");

  return dedupe(out);
}

export type ObservationFacts = {
  supportsTried: string[];
  outcome: "helped" | "partly_helped" | "did_not_help" | "not_assessed";
  strengthTags: string[];
  interestTags: string[];
  antecedentTags?: string[];
  possiblePatterns: Candidate[];
};

/**
 * Teacher observation → OBSERVED candidates (direct) and EMERGING candidates (possible patterns).
 * Supports count as evidence only when they helped (fully or partly).
 */
export function observationCandidates(o: ObservationFacts): { direct: Candidate[]; pending: Candidate[] } {
  const direct: Candidate[] = [];
  const add = (category: AttributeCategory, value: string) => {
    if (isKnownValue(category, value)) direct.push({ category, value });
  };
  if (o.outcome === "helped" || o.outcome === "partly_helped") o.supportsTried.forEach((s) => add("SUPPORT", s));
  o.strengthTags.forEach((s) => add("STRENGTH", s));
  o.interestTags.forEach((s) => add("INTEREST", s));
  (o.antecedentTags ?? []).forEach((s) => add("TRIGGER", s));

  const directKeys = new Set(direct.map(keyOf));
  const pending = o.possiblePatterns.filter((p) => isKnownValue(p.category, p.value) && !directKeys.has(keyOf(p)));
  return { direct: dedupe(direct), pending: dedupe(pending) };
}

export const keyOf = (c: Candidate) => `${c.category}:${c.value}`;

function dedupe(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(keyOf(c)) ? false : (seen.add(keyOf(c)), true)));
}

/** Persistent concern note — neutral, procedural, never names a condition. */
export const PERSISTENT_CONCERN_THRESHOLD = 4;

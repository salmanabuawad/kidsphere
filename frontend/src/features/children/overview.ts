import type { AssessmentsSummary, EnteredStamp, PerspectiveData, ProfileItem, ProfileResponse } from "./types";
import { lastStamp } from "./provenance";

/**
 * Pure read helpers for the Overview tab (COVERAGE-MATRIX §5.1, OM-D99-01): they pick the
 * parent answers (PP.*), the teacher's quick baseline (TP.bridge.*) and the section
 * statuses out of GET /api/children/{id}/profile. Every value is optional: a missing key
 * means "not answered yet", and older shapes (plain strings vs {text}) are both accepted.
 */

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** A free-text answer: a string, or {text} / {value, text}. Blank → null. */
export function textOf(v: unknown): string | null {
  if (typeof v === "string") return v.trim() ? v.trim() : null;
  if (isObj(v) && typeof v.text === "string") return v.text.trim() ? v.text.trim() : null;
  return null;
}

/** True when a JSON value holds an answer (empty strings, lists and objects do not). */
export function hasData(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(hasData);
  if (isObj(v)) return Object.entries(v).some(([k, x]) => k !== "not_answered" && hasData(x));
  return true;
}

function section(p: PerspectiveData | undefined, name: string): Json {
  const s = p?.sections?.[name];
  return isObj(s) ? s : {};
}

function stampOf(p: PerspectiveData | undefined, name: string): EnteredStamp | null {
  return lastStamp(p?.entered?.[name]);
}

export type GoodToKnowKey = "mostImportant" | "routines" | "overwhelm" | "overwhelmKnow" | "transitionObject" | "mayBeDifficult" | "remember";

export type GoodToKnowRow = {
  key: GoodToKnowKey;
  text: string;
  /** Whose words: the family's (PARENT SAID) or the teacher's (TEACHER OBSERVED). */
  from: "parent" | "teacher";
  stamp: EnteredStamp | null;
};

export type ReviewLater = { perspective: "parent" | "teacher"; section: string };

export type OverviewData = {
  heart: { message: string; stamp: EnteredStamp | null } | null;
  describeWords: ProfileItem[];
  appreciate: { text: string; stamp: EnteredStamp | null } | null;
  goodToKnow: GoodToKnowRow[];
  /** Health indicators only: the Overview never shows the health text itself. */
  foodNote: boolean;
  medicalNote: boolean;
  reach: { channels: string[]; other: string | null; matters: string | null; stamp: EnteredStamp | null } | null;
  questionnaireSubmitted: boolean;
  bridgeStarted: boolean;
  openQuestion: string | null;
  reviewLater: ReviewLater[];
  reviewLaterDomains: string[];
};

const ACTIVE_STATUSES = new Set(["in_progress", "sufficient", "review_later"]);

function items(v: unknown): ProfileItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? { key: x } : isObj(x) ? (x as ProfileItem) : null))
    .filter((x): x is ProfileItem => !!x && !!(x.key || x.custom));
}

function rememberLines(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(textOf).filter((s): s is string => !!s);
}

function reviewLaterOf(statuses: unknown, perspective: ReviewLater["perspective"]): ReviewLater[] {
  if (!isObj(statuses)) return [];
  return Object.entries(statuses)
    .filter(([, s]) => isObj(s) && s.status === "review_later")
    .map(([name]) => ({ perspective, section: name }));
}

export function overviewData(profile: ProfileResponse | undefined, assessments?: AssessmentsSummary | null): OverviewData {
  const pp = profile?.parent_perspective;
  const tp = profile?.teacher_perspective;
  const who = section(pp, "who");
  const heart = section(pp, "heart");
  const expectations = section(pp, "expectations");
  const priorities = section(pp, "priorities");
  const independence = section(pp, "independence");
  const emotions = section(pp, "emotions");
  const separation = section(pp, "separation");
  const health = section(pp, "health");
  const partnership = section(pp, "partnership");
  const bridge = section(tp, "bridge");

  const rows: GoodToKnowRow[] = [];
  const add = (key: GoodToKnowKey, text: string | null, from: GoodToKnowRow["from"], sec: string, p: PerspectiveData | undefined) => {
    if (text) rows.push({ key, text, from, stamp: stampOf(p, sec) });
  };
  const heartText = textOf(heart.message);
  const mostImportant = textOf(expectations.most_important);
  // The legacy one_thing_to_know slot was shared with the heart message: never show it twice.
  const legacy = textOf(priorities.one_thing_to_know);
  if (mostImportant) add("mostImportant", mostImportant, "parent", "expectations", pp);
  else if (legacy !== heartText) add("mostImportant", legacy, "parent", "priorities", pp);
  add("routines", textOf(independence.routines_to_keep), "parent", "independence", pp);
  const overwhelm = emotions.overwhelming_situations;
  if (!(isObj(overwhelm) && overwhelm.value === "no")) add("overwhelm", textOf(overwhelm), "parent", "emotions", pp);
  add("overwhelmKnow", textOf(emotions.overwhelm_teacher_should_know), "parent", "emotions", pp);
  const object = separation.transition_object;
  if (!(isObj(object) && object.value === "no")) add("transitionObject", textOf(object), "parent", "separation", pp);
  add("mayBeDifficult", textOf(bridge.may_be_difficult), "teacher", "bridge", tp);
  for (const line of rememberLines(bridge.remember)) rows.push({ key: "remember", text: line, from: "teacher", stamp: stampOf(tp, "bridge") });

  const food = isObj(health.food) ? health.food : {};
  const medical = isObj(health.medical) ? health.medical : {};
  const channels = isObj(partnership.contact_channels) ? partnership.contact_channels : {};
  const selected = Array.isArray(channels.selected) ? channels.selected.filter((k): k is string => typeof k === "string") : [];
  const reachOther = textOf(channels.other);
  const matters = textOf(partnership.communication_matters);

  const question = bridge.question_for_parent;
  const questionText = textOf(question);
  const clarified = isObj(question) && question.status === "clarified";

  // GET /profile repeats the statuses at the top level ({parent, teacher}); older shapes keep them in each perspective.
  const sectionStatus = profile?.section_status;
  const top: Json = isObj(sectionStatus) ? sectionStatus : {};
  const parentStatus = isObj(top.parent) ? top.parent : pp?.section_status;
  const tpStatus = tp?.section_status;
  const teacherStatus: Json = isObj(top.teacher) ? top.teacher : isObj(tpStatus) ? tpStatus : {};
  const bridgeEntry = teacherStatus.bridge;
  const bridgeStatus = isObj(bridgeEntry) ? bridgeEntry.status : undefined;
  const pq = pp?.questionnaire;
  const topQ = profile?.questionnaire;
  const questionnaire: Json = isObj(pq) ? pq : isObj(topQ) ? topQ : {};
  const appreciate = textOf(who.appreciate);

  const domains = assessments?.current?.domains;
  return {
    heart: heartText ? { message: heartText, stamp: stampOf(pp, "heart") } : null,
    describeWords: items(who.describe_words),
    appreciate: appreciate ? { text: appreciate, stamp: stampOf(pp, "who") } : null,
    goodToKnow: rows,
    foodNote: hasData(food.text) || hasData(food.flags),
    medicalNote: medical.value === "yes" || hasData(medical.text),
    reach: selected.length || reachOther || matters ? { channels: selected, other: reachOther, matters, stamp: stampOf(pp, "partnership") } : null,
    questionnaireSubmitted: questionnaire.status === "submitted",
    bridgeStarted: hasData(bridge) || (typeof bridgeStatus === "string" && ACTIVE_STATUSES.has(bridgeStatus)),
    openQuestion: questionText && !clarified ? questionText : null,
    reviewLater: [...reviewLaterOf(parentStatus, "parent"), ...reviewLaterOf(teacherStatus, "teacher")],
    reviewLaterDomains: isObj(domains)
      ? Object.entries(domains)
          .filter(([, d]) => isObj(d) && d.status === "review_later")
          .map(([k]) => k)
      : [],
  };
}

/** The ISO date a goal is next reviewed on: follow_up_on, else a legacy plan.review_on that is a date. */
export function nextReviewOn(focus: { follow_up_on?: string | null; plan?: { review_on?: string | null } | null }): string | null {
  if (focus.follow_up_on) return focus.follow_up_on;
  const legacy = focus.plan?.review_on;
  return typeof legacy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(legacy) ? legacy : null;
}

/** Main strengths (⭐) first, keeping the stored order otherwise. */
export function mainFirst(list: ProfileItem[]): ProfileItem[] {
  return [...list.filter((i) => i.main), ...list.filter((i) => !i.main)];
}

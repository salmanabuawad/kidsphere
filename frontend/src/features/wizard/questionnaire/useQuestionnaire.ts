import { useState } from "react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import {
  asStrings,
  hasValue,
  profileUrl,
  type EntryMode,
  type QPatch,
  type QProfile,
  type QuestionnairePatch,
  type SectionData,
} from "./model";

export function patchProfile(childId: string, body: QPatch) {
  return api<QProfile>(profileUrl(childId), { method: "PATCH", body });
}

/**
 * The family's questionnaire answers + unsaved edits per section. Each PATCH replaces one
 * whole section, so the edits start from the stored section (legacy keys included) and the
 * server keeps every earlier version. Staff saves carry the entry mode (on_behalf / meeting).
 */
export function useQuestionnaire(childId: string, mode: EntryMode) {
  const state = useFetch<QProfile>(profileUrl(childId));
  const [edits, setEdits] = useState<Record<string, SectionData>>({});
  const { pending, run } = useAction();

  const stored = (section: string): SectionData => state.data?.parent_perspective?.sections?.[section] ?? {};
  /** The answers of one section as edited so far (the stored ones when untouched). */
  const answersOf = (name: string): SectionData => edits[name] ?? stored(name);

  const update = (section: string, fn: (d: SectionData) => SectionData) =>
    setEdits((prev) => ({ ...prev, [section]: fn({ ...(prev[section] ?? stored(section)) }) }));

  /** Set (or with undefined, remove) one top-level field; an answer un-skips the question. */
  const setField = (section: string, field: string, value: unknown) =>
    update(section, (d) => {
      if (value === undefined || value === null) delete d[field];
      else d[field] = value;
      if (hasValue(value)) {
        const skipped = asStrings(d.not_answered).filter((f) => f !== field);
        if (skipped.length) d.not_answered = skipped;
        else delete d.not_answered;
      }
      return d;
    });

  /** "Skip this question": the field is listed in not_answered and its answer cleared. */
  const setSkipped = (section: string, field: string, skipped: boolean) =>
    update(section, (d) => {
      const list = asStrings(d.not_answered).filter((f) => f !== field);
      if (skipped) {
        list.push(field);
        delete d[field];
      }
      if (list.length) d.not_answered = list;
      else delete d.not_answered;
      return d;
    });

  const isSkipped = (name: string, field: string) => asStrings(answersOf(name).not_answered).includes(field);

  /** Save every edited section (one PATCH each); the last PATCH carries the step and record changes. */
  async function persist(extra: { wizard_step?: number; questionnaire?: QuestionnairePatch } = {}): Promise<boolean> {
    const staffMode = mode === "self" ? undefined : { entry_mode: mode };
    const bodies: QPatch[] = Object.entries(edits).map(([section, d]) => ({
      perspective: "parent",
      section,
      data: d,
      ...(staffMode ? { questionnaire: staffMode } : {}),
    }));
    if (bodies.length === 0) bodies.push({ perspective: "parent", ...(staffMode ? { questionnaire: staffMode } : {}) });
    const last = bodies.length - 1;
    const q = { ...(bodies[last]!.questionnaire ?? {}), ...(extra.questionnaire ?? {}) };
    bodies[last] = { ...bodies[last], ...(extra.wizard_step !== undefined ? { wizard_step: extra.wizard_step } : {}) };
    if (Object.keys(q).length) bodies[last]!.questionnaire = q;
    const r = await run(async () => {
      let latest: QProfile | undefined;
      for (const body of bodies) latest = await patchProfile(childId, body);
      return latest!;
    });
    if (r.ok) {
      state.setData(r.data);
      setEdits({});
    }
    return r.ok;
  }

  return { ...state, stored, answersOf, setField, setSkipped, isSkipped, persist, saving: pending, dirty: Object.keys(edits).length > 0 };
}

export type QuestionnaireState = ReturnType<typeof useQuestionnaire>;

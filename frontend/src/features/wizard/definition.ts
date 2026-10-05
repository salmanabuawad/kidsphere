/**
 * Declarative wizard steps 2–7 (step 1, basics, is its own form).
 *
 * Each field is tagged with who answers it: "parent", "teacher" or "both".
 * Staff see a "Parent says / Teacher says" toggle per step and fill either
 * perspective (PLAN-ADJUSTMENTS B2); parents only see parent/both fields.
 * Labels: wizard.fields.<name>.label / .hint; option labels come from
 * GET /api/options (backend/app/data/options.json).
 */
import type { LucideIcon } from "lucide-react";
import { ActivityIcon, AttentionIcon, ChildrenIcon, CurrentFocusIcon, StrengthsIcon, WhatHelpsIcon } from "@/icons";
import type { Tone } from "@/components/ui/Badge";
import type { PerspectiveName, SectionName } from "./api";

export type Who = "parent" | "teacher" | "both";

type Base = { name: string; who: Who; /** Shown under "More (optional)". */ collapsed?: boolean };

export type FieldDef =
  | (Base & { kind: "items"; list: string; custom?: boolean; tone?: Tone; max?: number })
  | (Base & { kind: "keys"; list: string; tone?: Tone })
  | (Base & { kind: "single"; list: string })
  | (Base & { kind: "text"; rows?: number })
  | (Base & { kind: "levels"; list: string })
  | (Base & { kind: "sensitivities" });

export type StepDef = {
  step: number;
  key: string;
  section: SectionName;
  /** A painted KidSphere icon (they are drop-ins for lucide icons). */
  icon: LucideIcon;
  /** The header tile behind the icon: the step's meaning tint, or tray. */
  tile?: string;
  fields: FieldDef[];
  /** Step 7: the teacher picks up to 3 Current Focus areas (focus API, not a profile section). */
  focusPicker?: boolean;
};

export const FIRST_SECTION_STEP = 2;
export const LAST_STEP = 7;
export const TOTAL_STEPS = 7;

export const STEPS: StepDef[] = [
  {
    step: 2,
    key: "who",
    section: "who",
    icon: StrengthsIcon,
    tile: "bg-strength-soft",
    fields: [
      { kind: "items", name: "strengths", list: "strengths", custom: true, tone: "strength", who: "both" },
      { kind: "items", name: "interests", list: "interests", custom: true, tone: "interest", who: "both" },
      { kind: "items", name: "describe_words", list: "describe_words", custom: true, tone: "brand", who: "both", max: 5 },
      { kind: "items", name: "motivators", list: "motivators", custom: true, tone: "brand", who: "both", collapsed: true },
      { kind: "text", name: "appreciate", who: "both", collapsed: true },
    ],
  },
  {
    step: 3,
    key: "emotions",
    section: "emotions",
    icon: WhatHelpsIcon,
    tile: "bg-helps-soft",
    fields: [
      { kind: "items", name: "calming_helps", list: "calming_helps", custom: true, tone: "helps", who: "both" },
      { kind: "items", name: "frustration_reactions", list: "frustration_reactions", custom: true, tone: "attention", who: "both" },
      { kind: "single", name: "transition_reaction", list: "transition_reactions", who: "both" },
      { kind: "items", name: "transition_helps", list: "transition_helps", custom: true, tone: "helps", who: "both" },
      { kind: "items", name: "helps_when_sad", list: "sad_helps", custom: true, tone: "helps", who: "both", collapsed: true },
      { kind: "single", name: "morning_separation", list: "morning_separation", who: "parent", collapsed: true },
      { kind: "text", name: "calming_notes", who: "both", collapsed: true },
      { kind: "text", name: "what_does_not_help", who: "both", collapsed: true },
    ],
  },
  {
    step: 4,
    key: "social",
    section: "social",
    icon: ChildrenIcon,
    fields: [
      { kind: "keys", name: "social", list: "social", who: "both" },
      { kind: "keys", name: "communication", list: "communication", who: "both" },
      { kind: "text", name: "comments", who: "both", collapsed: true },
    ],
  },
  {
    step: 5,
    key: "independence",
    section: "independence",
    icon: ActivityIcon,
    fields: [
      { kind: "levels", name: "levels", list: "independence_areas", who: "both" },
      { kind: "text", name: "independence_notes", who: "both", collapsed: true },
    ],
  },
  {
    step: 6,
    key: "environment",
    section: "environment",
    icon: AttentionIcon,
    tile: "bg-attention-soft",
    fields: [
      { kind: "sensitivities", name: "items", who: "both" },
      { kind: "text", name: "environment_notes", who: "both", collapsed: true },
    ],
  },
  {
    step: 7,
    key: "priorities",
    section: "priorities",
    icon: CurrentFocusIcon,
    tile: "bg-focus-soft",
    focusPicker: true,
    fields: [
      { kind: "keys", name: "parent_priorities", list: "priority_categories", tone: "brand", who: "parent" },
      { kind: "keys", name: "hope_child_feels", list: "hope_child_feels", tone: "brand", who: "parent" },
      { kind: "text", name: "one_thing_to_know", who: "parent" },
      { kind: "text", name: "priorities_note", who: "parent", collapsed: true },
    ],
  },
];

/** Field names whose stored key differs from the i18n name (both sections use "notes"). */
export const STORED_NAME: Record<string, string> = { independence_notes: "notes", environment_notes: "notes" };
export const storedName = (f: FieldDef) => STORED_NAME[f.name] ?? f.name;

export function stepDef(step: number): StepDef | undefined {
  return STEPS.find((s) => s.step === step);
}

export function fieldsFor(def: StepDef, perspective: PerspectiveName): FieldDef[] {
  return def.fields.filter((f) => f.who === "both" || f.who === perspective);
}

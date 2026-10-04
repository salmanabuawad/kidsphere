/**
 * Structured output contracts for AI-generated content.
 *
 * All provider output is parsed through these schemas and through
 * `childSafetyIssues` before it can be stored. Nothing that fails validation
 * is ever persisted, let alone published.
 */
import type { ContentType } from "@prisma/client";
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const sceneId = z.string().regex(/^[a-z0-9_-]{1,40}$/i);
/** A single emoji (or short emoji sequence) used as a built-in illustration. */
const illustration = z.string().min(1).max(16);

export const rationaleSchema = z.object({
  goalUsed: text(300),
  interestsUsed: z.array(z.string().max(60)).max(4),
  strengthsUsed: z.array(z.string().max(60)).max(4),
  supportsUsed: z.array(z.string().max(60)).max(4),
  avoided: z.array(z.string().max(60)).max(4),
  explanation: text(800),
});

export const homeActivitySchema = z.object({ title: text(120), instructions: text(800) });

const base = {
  title: text(140),
  language: z.enum(["ar", "he", "en"]),
  ageBand: z.string().max(10),
  goalId: z.string().max(64),
  durationMinutes: z.number().int().min(1).max(30),
  teacherRationale: rationaleSchema,
  optionalHomeActivity: homeActivitySchema.optional(),
};

export const sceneSchema = z.object({
  id: sceneId,
  narration: text(600),
  characterIds: z.array(z.string().max(64)).max(4),
  visualPrompt: text(300),
  illustration,
  choices: z
    .array(z.object({ label: text(80), illustration: illustration.optional(), nextSceneId: sceneId }))
    .max(3)
    .optional(),
});

export const storyBodySchema = z.object({ kind: z.literal("story"), ...base, scenes: z.array(sceneSchema).min(2).max(12) });

export const routineBodySchema = z.object({
  kind: z.literal("routine"),
  ...base,
  steps: z
    .array(z.object({ id: sceneId, label: text(80), narration: text(300), illustration }))
    .min(2)
    .max(10),
});

export const activityBodySchema = z.object({
  kind: z.literal("activity"),
  ...base,
  instructions: text(300),
  rounds: z
    .array(
      z.object({
        id: sceneId,
        prompt: text(200),
        options: z
          .array(z.object({ id: sceneId, label: text(60), illustration, isPreferred: z.boolean() }))
          .min(2)
          .max(4),
        encouragement: text(160),
      }),
    )
    .min(1)
    .max(8),
});

/** Adult-facing guides: movement, role play, home and discussion activities. */
export const guideBodySchema = z.object({
  kind: z.literal("guide"),
  ...base,
  audience: z.enum(["teacher", "parent"]),
  materials: z.array(z.string().max(80)).max(10),
  steps: z
    .array(z.object({ id: sceneId, label: text(80), instructions: text(500), illustration }))
    .min(1)
    .max(10),
});

export const contentBodySchema = z.discriminatedUnion("kind", [storyBodySchema, routineBodySchema, activityBodySchema, guideBodySchema]);

export type ContentBody = z.infer<typeof contentBodySchema>;
export type StoryBody = z.infer<typeof storyBodySchema>;
export type RoutineBody = z.infer<typeof routineBodySchema>;
export type ActivityBody = z.infer<typeof activityBodySchema>;
export type GuideBody = z.infer<typeof guideBodySchema>;
export type ContentKind = ContentBody["kind"];
export type Rationale = z.infer<typeof rationaleSchema>;

export const KIND_BY_TYPE: Record<ContentType, ContentKind> = {
  INTERACTIVE_STORY: "story",
  STORY: "story",
  SOCIAL_STORY: "story",
  VISUAL_ROUTINE: "routine",
  SIMPLE_GAME: "activity",
  MATCHING_ACTIVITY: "activity",
  CHOICE_ACTIVITY: "activity",
  MOVEMENT_ACTIVITY: "guide",
  ROLE_PLAY_ACTIVITY: "guide",
  PARENT_HOME_ACTIVITY: "guide",
  TEACHER_DISCUSSION_ACTIVITY: "guide",
  WEEKLY_PLAN: "guide",
};

/** Content kinds a child may open in the child player. */
export const CHILD_FACING_KINDS: ReadonlySet<ContentKind> = new Set(["story", "routine", "activity"]);

export function schemaForType(type: ContentType) {
  switch (KIND_BY_TYPE[type]) {
    case "story":
      return storyBodySchema;
    case "routine":
      return routineBodySchema;
    case "activity":
      return activityBodySchema;
    case "guide":
      return guideBodySchema;
  }
}

/**
 * Words children must never see (spec: no deficit/clinical labels) and any
 * diagnostic vocabulary, in all supported languages. Checked on child-facing
 * fields only; the teacher rationale may legitimately mention "goal".
 */
const FORBIDDEN_CHILD_TERMS = [
  // deficit labels
  "difficulty",
  "weakness",
  "intervention",
  "problem",
  "score",
  "risk",
  "struggle",
  "deficit",
  // diagnostic terms
  "adhd",
  "autism",
  "autistic",
  "disorder",
  "diagnos",
  "syndrome",
  "therapy",
  "anxiety",
  // Arabic
  "صعوبة",
  "ضعف",
  "مشكلة",
  "اضطراب",
  "توحد",
  "فرط الحركة",
  "تشخيص",
  // Hebrew
  "קושי",
  "חולשה",
  "התערבות",
  "בעיה",
  "סיכון",
  "הפרעה",
  "אוטיזם",
  "קשב וריכוז",
  "אבחנה",
];
const URL_PATTERN = /(https?:\/\/|www\.|\.com\b|\.org\b|\.net\b)/i;

function childFacingStrings(body: ContentBody): string[] {
  const out: string[] = [body.title];
  switch (body.kind) {
    case "story":
      for (const s of body.scenes) {
        out.push(s.narration);
        s.choices?.forEach((c) => out.push(c.label));
      }
      break;
    case "routine":
      body.steps.forEach((s) => out.push(s.label, s.narration));
      break;
    case "activity":
      out.push(body.instructions);
      for (const r of body.rounds) {
        out.push(r.prompt, r.encouragement);
        r.options.forEach((o) => out.push(o.label));
      }
      break;
    case "guide":
      break; // adult-facing
  }
  return out;
}

/** Semantic checks beyond the JSON schema. Empty array = safe. */
export function childSafetyIssues(body: ContentBody, expectedType: ContentType): string[] {
  const issues: string[] = [];
  if (KIND_BY_TYPE[expectedType] !== body.kind) issues.push(`kind must be "${KIND_BY_TYPE[expectedType]}"`);

  const all = [...childFacingStrings(body), ...(body.kind === "guide" ? body.steps.map((s) => s.instructions) : [])];
  for (const s of all) {
    if (URL_PATTERN.test(s)) issues.push("content must not contain links or web addresses");
    const lower = s.toLowerCase();
    for (const term of FORBIDDEN_CHILD_TERMS) {
      if (body.kind !== "guide" && lower.includes(term)) issues.push(`child-facing text must not use the word "${term}"`);
    }
  }

  if (body.kind === "story") {
    const ids = new Set(body.scenes.map((s) => s.id));
    if (ids.size !== body.scenes.length) issues.push("scene ids must be unique");
    for (const s of body.scenes) {
      for (const c of s.choices ?? []) {
        if (!ids.has(c.nextSceneId)) issues.push(`choice in scene ${s.id} points to unknown scene ${c.nextSceneId}`);
      }
    }
    if (expectedType === "INTERACTIVE_STORY" && !body.scenes.some((s) => (s.choices?.length ?? 0) > 0)) {
      issues.push("an interactive story needs at least one scene with choices");
    }
  }
  if (body.kind === "activity") {
    for (const r of body.rounds) if (!r.options.some((o) => o.isPreferred)) issues.push(`round ${r.id} needs one preferred option`);
  }
  return [...new Set(issues)];
}

/** AI suggestions of normalized profile attributes (always created as pending). */
export const attributeSuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        category: z.enum(["INTEREST", "STRENGTH", "SUPPORT", "TRIGGER", "SENSORY", "LEARNING_PREFERENCE"]),
        value: z.string().regex(/^[a-z0-9_]{1,60}$/),
        reason: z.string().max(300),
      }),
    )
    .max(6),
});
export type AttributeSuggestions = z.infer<typeof attributeSuggestionSchema>;

/**
 * JSON Schema for provider-side structured output. Length/count constraints
 * are stripped (some providers reject them); Zod still enforces them locally.
 */
export function toProviderJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  const STRIP = new Set(["minLength", "maxLength", "minItems", "maxItems", "pattern", "minimum", "maximum", "$schema", "format"]);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) if (!STRIP.has(k)) out[k] = walk(v);
      if (out.type === "object" && out.properties && out.additionalProperties === undefined) out.additionalProperties = false;
      return out;
    }
    return node;
  };
  return walk(raw) as Record<string, unknown>;
}

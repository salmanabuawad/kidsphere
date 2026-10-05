/**
 * Request validators. Every API route parses its input through one of these;
 * objects are `.strict()` so unexpected fields (e.g. `role`, `organizationId`)
 * are rejected rather than silently ignored.
 */
import { z } from "zod";
import { LOCALES } from "@/lib/i18n/config";

const id = z.string().min(1).max(64);
const shortText = z.string().trim().max(500);
const longText = z.string().trim().max(4000);
const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** For PATCH bodies: omitted stays undefined (unchanged); "" or null clears. */
const patchText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

export const localeSchema = z.enum(LOCALES);
const snakeKey = z.string().regex(/^[a-z0-9_]{1,60}$/);

export const ROLE_VALUES = ["SUPER_ADMIN", "ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN", "TEACHER", "PARENT"] as const;
export const DOMAIN_VALUES = [
  "EMOTIONAL",
  "SOCIAL",
  "LANGUAGE",
  "ATTENTION_EF",
  "PLAY",
  "GROSS_MOTOR",
  "FINE_MOTOR",
  "INDEPENDENCE",
  "SENSORY",
  "COGNITIVE",
  "PARTICIPATION",
] as const;
export const CONTEXT_VALUES = [
  "arrival",
  "free_play",
  "group_time",
  "structured_activity",
  "yard",
  "meal",
  "art",
  "transition",
  "end_of_day",
  "other",
] as const;
export const CONTENT_TYPE_VALUES = [
  "INTERACTIVE_STORY",
  "STORY",
  "SOCIAL_STORY",
  "SIMPLE_GAME",
  "VISUAL_ROUTINE",
  "MATCHING_ACTIVITY",
  "CHOICE_ACTIVITY",
  "MOVEMENT_ACTIVITY",
  "ROLE_PLAY_ACTIVITY",
  "PARENT_HOME_ACTIVITY",
  "TEACHER_DISCUSSION_ACTIVITY",
  "WEEKLY_PLAN",
] as const;
export const CATEGORY_VALUES = [
  "INTEREST",
  "STRENGTH",
  "EMOTIONAL_REGULATION",
  "SOCIAL_INTERACTION",
  "COMMUNICATION",
  "LANGUAGE",
  "EXECUTIVE_FUNCTION",
  "PLAY",
  "MOTOR",
  "INDEPENDENCE",
  "SENSORY",
  "LEARNING_PREFERENCE",
  "TRIGGER",
  "SUPPORT",
  "FAMILY_PRIORITY",
] as const;
export const RELATION_VALUES = ["CHILD", "MOTHER", "FATHER", "SIBLING", "GRANDPARENT", "FAMILY_MEMBER", "FRIEND"] as const;

// ── Auth ──
/** "email" accepts an e-mail address or a plain username (e.g. "admin"). */
export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(200)
      .regex(/^[a-z0-9._%+@-]+$/),
    password: z.string().min(1).max(200),
  })
  .strict();
export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() }).strict();
export const resetSchema = z.object({ token: z.string().min(10).max(200), password: z.string().min(10).max(200) }).strict();
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(200) }).strict();
export const updateMeSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), uiLocale: localeSchema.optional() }).strict();
export const setLocaleSchema = z.object({ locale: localeSchema }).strict();

// ── Children ──
export const createChildSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: optionalText(80),
    displayName: z.string().trim().min(1).max(80).optional(),
    dateOfBirth: z.coerce.date(),
    primaryLanguage: localeSchema,
    otherLanguages: z.array(localeSchema).max(3).default([]),
    kindergartenId: id,
    classId: id.optional().nullable(),
  })
  .strict();
export const updateChildSchema = createChildSchema.partial().strict();

// ── Questionnaire ──
export const multiAnswer = z.object({ selected: z.array(snakeKey).max(30), other: optionalText(500) }).strict();
export const gridAnswer = z.record(snakeKey, snakeKey);
export const answerValue = z.union([z.string().max(4000), multiAnswer, gridAnswer]);
export const saveQuestionnaireSchema = z
  .object({
    answers: z.record(snakeKey, answerValue),
    currentSection: snakeKey.optional(),
    submit: z.boolean().default(false),
  })
  .strict();

// ── Observations ──
const possiblePattern = z.object({ category: z.enum(CATEGORY_VALUES), value: snakeKey }).strict();

export const quickObservationSchema = z
  .object({
    kind: z.literal("QUICK"),
    context: z.enum(CONTEXT_VALUES),
    domains: z.array(z.enum(DOMAIN_VALUES)).min(1).max(11),
    observedBehavior: z.string().trim().min(2).max(1000),
    frequencyOrDuration: optionalText(200),
    whatHappenedBefore: optionalText(500),
    antecedentTags: z.array(snakeKey).max(10).default([]),
    supportsTried: z.array(snakeKey).max(15).default([]),
    customSupport: optionalText(120),
    outcome: z.enum(["helped", "partly_helped", "did_not_help", "not_assessed"]).default("not_assessed"),
    strengthNoticed: optionalText(300),
    strengthTags: z.array(snakeKey).max(5).default([]),
    interestTags: z.array(snakeKey).max(5).default([]),
    teacherNote: optionalText(1000),
    possiblePatterns: z.array(possiblePattern).max(3).default([]),
    observedAt: z.coerce.date().optional(),
    /** Seconds the teacher spent filling the form (product metric only). */
    entrySeconds: z.number().int().min(0).max(3600).optional(),
    /** Client-generated id that makes double-submits idempotent. */
    clientRequestId: z.string().max(64).optional(),
  })
  .strict();

const participationEntry = z
  .object({
    succeeds: optionalText(500),
    difficult: optionalText(500),
    support_required: optionalText(500),
    what_helps: optionalText(500),
  })
  .strict();

export const fullObservationSchema = z
  .object({
    kind: z.literal("FULL"),
    context: z.enum(CONTEXT_VALUES).default("other"),
    observedBehavior: z.string().trim().min(2).max(4000),
    items: z
      .array(
        z
          .object({
            domain: z.enum(DOMAIN_VALUES),
            itemKey: snakeKey,
            rating: z.enum(["NOT_OBSERVED", "BEGINNING", "WITH_SUPPORT", "CONSISTENT"]),
            note: optionalText(500),
          })
          .strict(),
      )
      .max(200)
      .default([]),
    sensory: z
      .object({ overwhelmed: optionalText(1000), regulation: optionalText(1000) })
      .strict()
      .optional(),
    participation: z.record(z.enum(CONTEXT_VALUES), participationEntry).optional(),
    supportsTried: z.array(snakeKey).max(15).default([]),
    outcome: z.enum(["helped", "partly_helped", "did_not_help", "not_assessed"]).default("not_assessed"),
    strengthTags: z.array(snakeKey).max(8).default([]),
    interestTags: z.array(snakeKey).max(8).default([]),
    strengthNoticed: optionalText(500),
    teacherNote: optionalText(2000),
    possiblePatterns: z.array(possiblePattern).max(5).default([]),
    observedAt: z.coerce.date().optional(),
    clientRequestId: z.string().max(64).optional(),
  })
  .strict();

export const observationSchema = z.discriminatedUnion("kind", [quickObservationSchema, fullObservationSchema]);
export type QuickObservationInput = z.infer<typeof quickObservationSchema>;
export type FullObservationInput = z.infer<typeof fullObservationSchema>;
export type ObservationInput = z.infer<typeof observationSchema>;

export const attributeActionSchema = z
  .object({ note: optionalText(500) })
  .strict()
  .default({ note: null });
export const manualAttributeSchema = z.object({ category: z.enum(CATEGORY_VALUES), value: snakeKey, note: optionalText(500) }).strict();

// ── Goals ──
export const createGoalSchema = z
  .object({
    domain: z.enum(DOMAIN_VALUES),
    statement: z.string().trim().min(5).max(300),
    successIndicator: z.string().trim().min(5).max(300),
    startDate: z.coerce.date(),
    reviewDate: z.coerce.date(),
    parentReinforcement: optionalText(1000),
    parentFocus: optionalText(300),
    shareWithParent: z.boolean().default(false),
    evidenceAttributeIds: z.array(id).max(10).default([]),
  })
  .strict()
  .refine((g) => g.reviewDate > g.startDate, { message: "Review date must be after start date", path: ["reviewDate"] });

export const updateGoalSchema = z
  .object({
    statement: z.string().trim().min(5).max(300).optional(),
    successIndicator: z.string().trim().min(5).max(300).optional(),
    reviewDate: z.coerce.date().optional(),
    status: z.enum(["ACTIVE", "PAUSED", "ACHIEVED", "CLOSED"]).optional(),
    parentReinforcement: patchText(1000),
    parentFocus: patchText(300),
    shareWithParent: z.boolean().optional(),
  })
  .strict();

// ── Generation & content ──
export const generateSchema = z
  .object({
    contentType: z.enum(CONTENT_TYPE_VALUES),
    language: localeSchema,
    durationMinutes: z.number().int().min(2).max(20).default(5),
    theme: optionalText(80),
    /** Teacher-selected subset of the proposed personalization (keys). */
    include: z
      .object({
        interests: z.array(snakeKey).max(2).default([]),
        strengths: z.array(snakeKey).max(2).default([]),
        supports: z.array(snakeKey).max(3).default([]),
        avoid: z.array(snakeKey).max(3).default([]),
      })
      .strict()
      .optional(),
    characterAssetIds: z.array(id).max(3).default([]),
    teacherInstruction: optionalText(300),
  })
  .strict();
export type GenerateInput = z.infer<typeof generateSchema>;

export const patchContentSchema = z
  .object({
    revision: z.number().int().positive(),
    title: z.string().trim().min(1).max(160).optional(),
    body: z.unknown().optional(),
    removeCharacterIds: z.array(id).max(5).optional(),
  })
  .strict();

export const regenerateSchema = z
  .object({
    revision: z.number().int().positive(),
    mode: z.enum(["full", "scene", "simplify", "harder", "language", "theme", "remove_personalization"]),
    sceneId: z.string().max(40).optional(),
    language: localeSchema.optional(),
    theme: optionalText(80),
    removeKeys: z.array(snakeKey).max(10).optional(),
  })
  .strict();

export const approvalNoteSchema = z
  .object({ note: optionalText(500), revision: z.number().int().positive().optional() })
  .strict()
  .default({ note: null });

// ── Outcomes ──
export const outcomeSchema = z
  .object({
    result: z.enum(["HELPED", "PARTLY_HELPED", "DID_NOT_HELP", "NOT_OBSERVED"]),
    contentId: id.optional().nullable(),
    support: snakeKey.optional().nullable(),
    note: optionalText(1000),
    context: z.enum(CONTEXT_VALUES).optional().nullable(),
    durationMinutes: z.number().int().min(0).max(600).optional().nullable(),
    observationId: id.optional().nullable(),
    clientRequestId: z.string().max(64).optional(),
  })
  .strict();

// ── Weekly plan ──
export const weeklyPlanSchema = z
  .object({
    classId: id,
    weekStart: z.coerce.date(),
    notes: optionalText(1000),
    /** Goals for which to create the default Mon–Fri package. */
    goalIds: z.array(id).max(60).default([]),
  })
  .strict();
export const planItemUpdateSchema = z.object({ status: z.enum(["PLANNED", "READY", "DONE", "SKIPPED"]) }).strict();

// ── Media & consent ──
export const consentSchema = z
  .object({
    mediaAssetId: id,
    personRelation: z.enum(RELATION_VALUES),
    personLabel: z.string().trim().min(1).max(60),
    allowedPurposes: z.array(z.enum(["CHARACTER_INSPIRATION", "STORY_ILLUSTRATION"])).min(1),
    allowedContentTypes: z.array(z.enum(CONTENT_TYPE_VALUES)).min(1),
  })
  .strict();
export const consentPatchSchema = z.object({ status: z.literal("REVOKED") }).strict();
export const mediaMetaSchema = z.object({ personRelation: z.enum(RELATION_VALUES), personLabel: z.string().trim().min(1).max(60) }).strict();

// ── Parent messages ──
export const parentMessageSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();

// ── Child mode ──
export const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");
export const childModeLaunchSchema = z.object({ childId: id, pin: pinSchema }).strict();
export const childModeExitSchema = z.object({ pin: pinSchema }).strict();

// ── Admin ──
export const orgSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
    subdomain: z
      .string()
      .regex(/^[a-z0-9-]{2,40}$/)
      .optional()
      .nullable(),
    brandColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    defaultLocale: localeSchema.optional(),
  })
  .strict();
export const orgSettingsSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    brandColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    defaultLocale: localeSchema.optional(),
    enabledLocales: z.array(localeSchema).min(1).optional(),
    aiProvider: z.enum(["anthropic", "openai", "demo"]).nullable().optional(),
    aiEnabled: z.boolean().optional(),
    mediaEnabled: z.boolean().optional(),
  })
  .strict();
export const kindergartenSchema = z
  .object({ name: z.string().trim().min(2).max(120), slug: z.string().regex(/^[a-z0-9-]{2,40}$/), address: optionalText(200), organizationId: id.optional() })
  .strict();
export const classSchema = z
  .object({ name: z.string().trim().min(1).max(80), kindergartenId: id, ageBand: z.string().max(10).default("3-5"), contentLocale: localeSchema.default("ar") })
  .strict();
export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    name: z.string().trim().min(1).max(120),
    role: z.enum(ROLE_VALUES),
    password: z.string().min(10).max(200),
    organizationId: id.optional().nullable(),
    kindergartenId: id.optional().nullable(),
    uiLocale: localeSchema.default("ar"),
  })
  .strict();
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(ROLE_VALUES).optional(),
    isActive: z.boolean().optional(),
    kindergartenId: id.nullable().optional(),
  })
  .strict();
export const assignTeacherSchema = z.object({ classId: id, userId: id, assign: z.boolean() }).strict();
export const linkParentSchema = z.object({ childId: id, parentId: id, relation: z.enum(RELATION_VALUES).default("MOTHER"), link: z.boolean() }).strict();
export const templateSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    type: z.enum(CONTENT_TYPE_VALUES),
    language: localeSchema,
    description: optionalText(500),
    domain: z.enum(DOMAIN_VALUES).nullable().optional(),
    ageBand: z.string().max(10).default("3-5"),
    body: z.unknown(),
    isActive: z.boolean().default(true),
  })
  .strict();
export const auditQuerySchema = z
  .object({
    action: z.string().max(60).optional(),
    objectType: z.string().max(60).optional(),
    actorId: id.optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .strict();

export { shortText, longText, snakeKey };

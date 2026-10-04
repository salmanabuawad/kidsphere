import type { ContentStatus, ContentType, Locale, Prisma, VersionSource } from "@prisma/client";
import type { z } from "zod";
import type { Actor } from "@/lib/auth/actor";
import { audit } from "@/lib/audit";
import { track } from "@/lib/analytics";
import { db, type Tx } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { authorizeContent, authorizeGoal, authorizeChild, childScopeWhere, classScopeWhere } from "@/lib/permissions";
import { aiTimeoutMs, resolveProvider } from "@/lib/ai";
import { generationPrompt, SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { childSafetyIssues, type ContentBody, contentBodySchema, KIND_BY_TYPE, schemaForType, toProviderJsonSchema } from "@/lib/ai/schemas";
import type { GenerationContext } from "@/lib/ai/types";
import { evaluateConsent } from "@/features/consent/evaluate";
import { nextContentStatus } from "@/features/content/workflow";
import type { GenerateInput, patchContentSchema, regenerateSchema, templateSchema } from "@/server/validators";
import { ContentGenerationContextBuilder } from "./generation-context";

type GenerationOutcome = { body: ContentBody; provider: string; model: string; repaired: boolean; isDemo: boolean; aiRequestId: string };

/** Call the configured provider with validated structured output + repair, and log safe metadata. */
async function runGeneration(
  actor: Actor,
  organizationId: string,
  ctx: GenerationContext,
  operation: "generate_content" | "regenerate_content" | "regenerate_scene",
  variant: number,
): Promise<GenerationOutcome> {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (org && !org.aiEnabled) throw new AppError("AI_UNAVAILABLE", "AI features are turned off for your organization.");
  const provider = resolveProvider(org?.aiProvider);
  const schema = schemaForType(ctx.format);
  const started = Date.now();
  try {
    const result = await provider.generateStructuredContent<ContentBody>({
      operation,
      system: SYSTEM_PROMPT,
      prompt: generationPrompt(ctx),
      schema: schema as unknown as z.ZodType<ContentBody>,
      jsonSchema: toProviderJsonSchema(schema),
      input: { op: "generate", ctx, variant },
      validate: (body) => childSafetyIssues(body, ctx.format),
      timeoutMs: aiTimeoutMs(),
    });
    // Enforce identity fields regardless of what the model returned.
    const body = { ...result.value, goalId: ctx.goalId, language: ctx.contentLanguage, ageBand: ctx.ageBand } as ContentBody;
    const log = await db.aIRequestLog.create({
      data: {
        organizationId,
        actorId: actor.userId,
        provider: result.provider,
        model: result.model,
        operation,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
        success: true,
        repaired: result.repaired,
      },
    });
    return { body, provider: result.provider, model: result.model, repaired: result.repaired, isDemo: provider.isDemo, aiRequestId: log.id };
  } catch (e) {
    await db.aIRequestLog.create({
      data: {
        organizationId,
        actorId: actor.userId,
        provider: provider.name,
        model: provider.model,
        operation,
        durationMs: Date.now() - started,
        success: false,
        errorCode: e instanceof AppError ? e.code : "INTERNAL",
      },
    });
    throw e;
  }
}

/** Personalization proposal shown in the Generation Studio before generating. */
export async function getGenerationOptions(actor: Actor, goalId: string, contentType: ContentType | null) {
  const { goal, child } = await authorizeGoal(db, actor, goalId, "plan");
  const builder = new ContentGenerationContextBuilder(db);
  const [{ proposals, available }, characters, org] = await Promise.all([
    builder.proposals(child.id),
    builder.selectableCharacters(child.id, contentType),
    db.organization.findUnique({ where: { id: child.organizationId }, select: { enabledLocales: true, mediaEnabled: true } }),
  ]);
  return {
    goal,
    child: { id: child.id, displayName: child.displayName, primaryLanguage: child.primaryLanguage },
    proposals,
    available,
    characters: org?.mediaEnabled === false ? [] : characters,
    enabledLocales: org?.enabledLocales ?? ["ar", "he", "en"],
  };
}

/** Goal → AI draft. The result is always a DRAFT; nothing becomes child-visible here. */
export async function generateForGoal(actor: Actor, goalId: string, input: GenerateInput) {
  const { goal, child } = await authorizeGoal(db, actor, goalId, "plan");
  const builder = new ContentGenerationContextBuilder(db);
  const { context, characters } = await builder.build(child.id, goal.id, {
    contentType: input.contentType,
    language: input.language,
    durationMinutes: input.durationMinutes,
    theme: input.theme,
    teacherInstruction: input.teacherInstruction,
    include: input.include,
    characterAssetIds: input.characterAssetIds,
  });

  const gen = await runGeneration(actor, child.organizationId, context, "generate_content", 0);

  const content = await db.$transaction(async (tx) => {
    const asset = await tx.contentAsset.create({
      data: {
        organizationId: child.organizationId,
        childId: child.id,
        goalId: goal.id,
        classId: child.classId,
        type: input.contentType,
        language: input.language,
        title: gen.body.title,
        status: "DRAFT",
        ageBand: context.ageBand,
        durationMinutes: input.durationMinutes,
        domain: goal.domain,
        theme: input.theme,
        difficulty: context.difficulty,
        createdById: actor.userId,
        rationale: gen.body.teacherRationale as Prisma.InputJsonValue,
        generationContext: context as unknown as Prisma.InputJsonValue,
        isDemoGenerated: gen.isDemo,
        characters: { create: characters.map((c) => ({ mediaAssetId: c.id, consentId: c.consentId })) },
      },
    });
    const version = await tx.contentVersion.create({
      data: {
        contentId: asset.id,
        versionNumber: 1,
        body: gen.body as unknown as Prisma.InputJsonValue,
        source: "AI_GENERATED",
        aiRequestId: gen.aiRequestId,
        createdById: actor.userId,
      },
    });
    await tx.aIRequestLog.update({ where: { id: gen.aiRequestId }, data: { contentId: asset.id } });
    const updated = await tx.contentAsset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } });
    await audit(
      actor,
      "content.generate",
      "ContentAsset",
      asset.id,
      {
        childId: child.id,
        goalId: goal.id,
        type: input.contentType,
        language: input.language,
        provider: gen.provider,
        repaired: gen.repaired,
      },
      tx,
    );
    return updated;
  });
  await track("content_generated", child.organizationId, {
    contentType: input.contentType,
    language: input.language,
    provider: gen.provider,
    repaired: gen.repaired,
  });
  return content;
}

export async function getContent(actor: Actor, contentId: string) {
  const content = await authorizeContent(db, actor, contentId, "view");
  const full = await db.contentAsset.findUniqueOrThrow({
    where: { id: content.id },
    include: {
      currentVersion: true,
      versions: { select: { id: true, versionNumber: true, source: true, createdAt: true, createdById: true }, orderBy: { versionNumber: "desc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      characters: { include: { media: { include: { consents: true } } } },
      narrations: { orderBy: { createdAt: "desc" } },
      goal: { select: { id: true, statement: true, successIndicator: true, status: true } },
      child: { select: { id: true, displayName: true, firstName: true } },
    },
  });
  const characters = full.characters.map((c) => ({
    mediaAssetId: c.mediaAssetId,
    label: c.media.personLabel,
    relation: c.media.personRelation,
    usable: evaluateConsent(c.media.consents, "CHARACTER_INSPIRATION", full.type, !!c.media.deletedAt).allowed,
  }));
  if (actor.role === "PARENT") {
    // Parents see the published content only — no rationale, context or history.
    return {
      id: full.id,
      title: full.title,
      type: full.type,
      language: full.language,
      status: full.status,
      body: full.currentVersion?.body as ContentBody | undefined,
      characters: characters.filter((c) => c.usable),
      narrations: full.narrations.filter((n) => n.approved).map((n) => ({ id: n.id, sceneId: n.sceneId })),
    };
  }
  return { ...full, body: full.currentVersion?.body as ContentBody | undefined, characters };
}

async function newVersion(tx: Tx, contentId: string, body: ContentBody, source: VersionSource, actorId: string, aiRequestId?: string) {
  const last = await tx.contentVersion.findFirst({ where: { contentId }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
  return tx.contentVersion.create({
    data: {
      contentId,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      body: body as unknown as Prisma.InputJsonValue,
      source,
      aiRequestId,
      createdById: actorId,
    },
  });
}

/**
 * Optimistic-concurrency update: only succeeds when the client's revision is
 * current. A stale tab gets STALE_EDIT instead of silently overwriting.
 */
async function bumpRevision(tx: Tx, contentId: string, revision: number, data: Prisma.ContentAssetUncheckedUpdateManyInput) {
  const res = await tx.contentAsset.updateMany({ where: { id: contentId, revision }, data: { ...data, revision: { increment: 1 } } });
  if (res.count === 0) {
    throw new AppError("STALE_EDIT", "This content was changed in another window. Reload to see the latest version.");
  }
}

function validateBody(type: ContentType, raw: unknown): ContentBody {
  const parsed = schemaForType(type).safeParse(raw);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "The content is not in a valid format.", {
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const body = parsed.data as ContentBody;
  const issues = childSafetyIssues(body, type);
  if (issues.length) throw new AppError("VALIDATION", "The content did not pass child-safety checks.", { issues: issues.slice(0, 5) });
  return body;
}

/** Teacher edit. Always returns the item to DRAFT — edited content must be re-approved. */
export async function patchContent(actor: Actor, contentId: string, input: z.infer<typeof patchContentSchema>) {
  const content = await authorizeContent(db, actor, contentId, "edit");
  nextContentStatus(content.status, "edit");
  const current = await db.contentVersion.findUnique({ where: { id: content.currentVersionId ?? "" } });
  let body = input.body !== undefined ? validateBody(content.type, input.body) : (current?.body as unknown as ContentBody);
  if (input.title) body = { ...body, title: input.title };
  if (input.removeCharacterIds?.length && body.kind === "story") {
    const remove = new Set(input.removeCharacterIds);
    body = { ...body, scenes: body.scenes.map((s) => ({ ...s, characterIds: s.characterIds.filter((c) => !remove.has(c)) })) };
  }
  const edited = [input.title ? "title" : null, input.body !== undefined ? "body" : null, input.removeCharacterIds?.length ? "characters" : null].filter(
    Boolean,
  ) as string[];

  const updated = await db.$transaction(async (tx) => {
    const version = await newVersion(tx, content.id, body, "TEACHER_EDIT", actor.userId);
    await bumpRevision(tx, content.id, input.revision, {
      title: body.title,
      currentVersionId: version.id,
      status: "DRAFT",
      publishedAt: null,
    });
    if (input.removeCharacterIds?.length) {
      await tx.contentCharacter.deleteMany({ where: { contentId: content.id, mediaAssetId: { in: input.removeCharacterIds } } });
    }
    if (content.status !== "DRAFT") {
      await tx.contentApproval.create({
        data: { contentId: content.id, versionId: version.id, action: "RETURNED_TO_DRAFT", actorId: actor.userId, note: "edited" },
      });
      await tx.teacherNarration.updateMany({ where: { contentId: content.id }, data: { approved: false } });
    }
    await audit(actor, "content.edit", "ContentAsset", content.id, { fields: edited, previousStatus: content.status }, tx);
    return tx.contentAsset.findUniqueOrThrow({ where: { id: content.id } });
  });
  await track("content_edited", content.organizationId, { contentType: content.type, editedFields: edited.join("_") || "none" });
  return updated;
}

/** Regenerate the whole item, one scene, or a variation (simpler/harder/language/theme/remove personalization). */
export async function regenerateContent(actor: Actor, contentId: string, input: z.infer<typeof regenerateSchema>) {
  const content = await authorizeContent(db, actor, contentId, "edit");
  nextContentStatus(content.status, "edit");
  if (!content.childId || !content.goalId || !content.generationContext) {
    throw new AppError("INVALID_TRANSITION", "Only AI-personalized content can be regenerated.");
  }
  const prev = content.generationContext as unknown as GenerationContext;
  let ctx: GenerationContext = { ...prev };
  switch (input.mode) {
    case "simplify":
      ctx.difficulty = Math.max(1, prev.difficulty - 1);
      break;
    case "harder":
      ctx.difficulty = Math.min(3, prev.difficulty + 1);
      break;
    case "language":
      if (!input.language) throw new AppError("VALIDATION", "Choose a language");
      ctx.contentLanguage = input.language;
      break;
    case "theme":
      ctx.theme = input.theme ?? null;
      break;
    case "remove_personalization": {
      const remove = new Set(input.removeKeys ?? []);
      ctx = {
        ...ctx,
        interests: ctx.interests.filter((k) => !remove.has(k)),
        strengths: ctx.strengths.filter((k) => !remove.has(k)),
        supports: ctx.supports.filter((k) => !remove.has(k)),
        avoid: ctx.avoid.filter((k) => !remove.has(k)),
      };
      break;
    }
    default:
      break;
  }

  // Re-check consent for every character still attached; revoked ones are dropped.
  const builder = new ContentGenerationContextBuilder(db);
  const usable = await builder.selectableCharacters(content.childId, content.type);
  const usableIds = new Set(usable.map((c) => c.id));
  ctx.approvedCharacters = ctx.approvedCharacters.filter((c) => usableIds.has(c.id));
  // Re-validate personalization against the *current* profile (attributes may have been retired).
  const { available } = await builder.proposals(content.childId);
  ctx.interests = ctx.interests.filter((k) => available.interests.includes(k));
  ctx.strengths = ctx.strengths.filter((k) => available.strengths.includes(k));
  ctx.supports = ctx.supports.filter((k) => available.supports.includes(k));
  ctx.avoid = ctx.avoid.filter((k) => available.avoid.includes(k));

  const variant = (await db.contentVersion.count({ where: { contentId: content.id } })) + 1;
  const operation = input.mode === "scene" ? "regenerate_scene" : "regenerate_content";
  const gen = await runGeneration(actor, content.organizationId, ctx, operation, variant);

  let body = gen.body;
  if (input.mode === "scene") {
    const current = (await db.contentVersion.findUnique({ where: { id: content.currentVersionId ?? "" } }))?.body as unknown as ContentBody | undefined;
    if (!current || current.kind !== "story" || body.kind !== "story" || !input.sceneId) {
      throw new AppError("VALIDATION", "Scene regeneration is available for stories only.");
    }
    const replacement = body.scenes.find((s) => s.id === input.sceneId);
    if (!replacement) throw new AppError("AI_INVALID_OUTPUT", "The regenerated story did not include that scene. Try regenerating the whole story.");
    body = { ...current, scenes: current.scenes.map((s) => (s.id === input.sceneId ? { ...replacement, choices: s.choices } : s)) };
    validateBody(content.type, body);
  }

  const updated = await db.$transaction(async (tx) => {
    const version = await newVersion(tx, content.id, body, "AI_REGENERATED", actor.userId, gen.aiRequestId);
    await bumpRevision(tx, content.id, input.revision, {
      title: body.title,
      language: ctx.contentLanguage as Locale,
      difficulty: ctx.difficulty,
      theme: ctx.theme,
      currentVersionId: version.id,
      status: "DRAFT",
      publishedAt: null,
      rationale: body.teacherRationale as Prisma.InputJsonValue,
      generationContext: ctx as unknown as Prisma.InputJsonValue,
      isDemoGenerated: gen.isDemo,
    });
    await tx.contentCharacter.deleteMany({ where: { contentId: content.id, mediaAssetId: { notIn: [...usableIds] } } });
    await tx.aIRequestLog.update({ where: { id: gen.aiRequestId }, data: { contentId: content.id } });
    if (content.status !== "DRAFT") {
      await tx.contentApproval.create({
        data: { contentId: content.id, versionId: version.id, action: "RETURNED_TO_DRAFT", actorId: actor.userId, note: `regenerate:${input.mode}` },
      });
      await tx.teacherNarration.updateMany({ where: { contentId: content.id }, data: { approved: false } });
    }
    await audit(actor, "content.regenerate", "ContentAsset", content.id, { mode: input.mode, provider: gen.provider }, tx);
    return tx.contentAsset.findUniqueOrThrow({ where: { id: content.id } });
  });
  await track("content_regenerated", content.organizationId, { contentType: content.type, mode: input.mode, provider: gen.provider });
  return updated;
}

async function assertCharactersStillConsented(contentId: string, type: ContentType) {
  const chars = await db.contentCharacter.findMany({ where: { contentId }, include: { media: { include: { consents: true } } } });
  for (const c of chars) {
    if (!evaluateConsent(c.media.consents, "CHARACTER_INSPIRATION", type, !!c.media.deletedAt).allowed) {
      throw new AppError("CONSENT_REVOKED", "A character in this content no longer has family consent. Remove the character before approving.");
    }
  }
}

async function transition(
  actor: Actor,
  contentId: string,
  action: "submit_review" | "approve" | "publish" | "archive",
  note: string | null,
  expectedRevision?: number,
) {
  const permission = action === "publish" ? "publish" : action === "approve" ? "approve" : "edit";
  const content = await authorizeContent(db, actor, contentId, permission);
  let target: ContentStatus;
  try {
    target = nextContentStatus(content.status, action);
  } catch (e) {
    if (action === "publish") await audit(actor, "content.publish_blocked", "ContentAsset", content.id, { status: content.status });
    throw e;
  }
  if (expectedRevision && expectedRevision !== content.revision) {
    throw new AppError("STALE_EDIT", "This content changed since you opened it. Reload and review the latest version.");
  }
  if (action === "approve" || action === "publish") {
    // Never approve/publish malformed output: re-validate the exact version being released.
    const version = await db.contentVersion.findUnique({ where: { id: content.currentVersionId ?? "" } });
    if (!version) throw new AppError("VALIDATION", "This content has no version to approve.");
    validateBody(content.type, version.body);
    await assertCharactersStillConsented(content.id, content.type);
  }

  const updated = await db.$transaction(async (tx) => {
    if (action === "approve" && content.status === "DRAFT") {
      await tx.contentApproval.create({
        data: { contentId: content.id, versionId: content.currentVersionId, action: "SUBMITTED_FOR_REVIEW", actorId: actor.userId },
      });
    }
    const res = await tx.contentAsset.updateMany({
      where: { id: content.id, status: content.status, revision: content.revision },
      data: {
        status: target,
        publishedAt: target === "PUBLISHED" ? new Date() : undefined,
        archivedAt: target === "ARCHIVED" ? new Date() : undefined,
      },
    });
    if (res.count === 0) throw new AppError("STALE_EDIT", "This content changed while you were reviewing it. Reload and try again.");
    const approvalAction = { submit_review: "SUBMITTED_FOR_REVIEW", approve: "APPROVED", publish: "PUBLISHED", archive: "ARCHIVED" } as const;
    await tx.contentApproval.create({
      data: { contentId: content.id, versionId: content.currentVersionId, action: approvalAction[action], actorId: actor.userId, note },
    });
    if (action === "approve" || action === "publish") {
      await tx.teacherNarration.updateMany({ where: { contentId: content.id }, data: { approved: true } });
    }
    const auditAction = { submit_review: "content.submit_review", approve: "content.approve", publish: "content.publish", archive: "content.archive" } as const;
    await audit(actor, auditAction[action], "ContentAsset", content.id, { from: content.status, to: target }, tx);
    return tx.contentAsset.findUniqueOrThrow({ where: { id: content.id } });
  });
  if (action === "approve") await track("content_approved", content.organizationId, { contentType: content.type });
  if (action === "publish") await track("content_published", content.organizationId, { contentType: content.type });
  return updated;
}

export const submitForReview = (a: Actor, id: string, note: string | null = null) => transition(a, id, "submit_review", note);
export const approveContent = (a: Actor, id: string, note: string | null = null, revision?: number) => transition(a, id, "approve", note, revision);
export const publishContent = (a: Actor, id: string, note: string | null = null) => transition(a, id, "publish", note);
export const archiveContent = (a: Actor, id: string, note: string | null = null) => transition(a, id, "archive", note);

export type LibraryFilters = {
  language?: Locale;
  type?: ContentType;
  status?: ContentStatus;
  domain?: string;
  goalId?: string;
  classId?: string;
  createdById?: string;
  ageBand?: string;
  childId?: string;
};

/** Content library for staff: everything in the actor's scope, filterable. */
export async function listLibrary(actor: Actor, f: LibraryFilters) {
  if (actor.role === "PARENT") throw new AppError("FORBIDDEN");
  const classIds = (await db.class.findMany({ where: classScopeWhere(actor), select: { id: true } })).map((c) => c.id);
  const where: Prisma.ContentAssetWhereInput = {
    AND: [
      actor.role === "SUPER_ADMIN" ? {} : { organizationId: actor.organizationId ?? "__none__" },
      { OR: [{ child: childScopeWhere(actor) }, { childId: null, classId: { in: classIds } }] },
      f.language ? { language: f.language } : {},
      f.type ? { type: f.type } : {},
      f.status ? { status: f.status } : { status: { not: "ARCHIVED" } },
      f.domain ? { domain: f.domain as Prisma.EnumDevelopmentDomainNullableFilter["equals"] } : {},
      f.goalId ? { goalId: f.goalId } : {},
      f.classId ? { classId: f.classId } : {},
      f.createdById ? { createdById: f.createdById } : {},
      f.ageBand ? { ageBand: f.ageBand } : {},
      f.childId ? { childId: f.childId } : {},
    ],
  };
  const [items, templates] = await Promise.all([
    db.contentAsset.findMany({
      where,
      include: { child: { select: { id: true, displayName: true } }, goal: { select: { id: true, statement: true } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    db.contentTemplate.findMany({
      where: {
        isActive: true,
        OR: [{ organizationId: null }, { organizationId: actor.organizationId ?? "__none__" }],
        ...(f.language ? { language: f.language } : {}),
        ...(f.type ? { type: f.type } : {}),
      },
      orderBy: { title: "asc" },
    }),
  ]);
  return { items, templates };
}

/** Replace the child's display name with a placeholder throughout a body. */
export function anonymizeBody(body: ContentBody, names: string[]): ContentBody {
  const json = JSON.stringify(body);
  const replaced = names.filter((n) => n.length > 1).reduce((s, n) => s.split(n).join("{{child}}"), json);
  const parsed = JSON.parse(replaced) as ContentBody;
  if (parsed.kind === "story") parsed.scenes = parsed.scenes.map((s) => ({ ...s, characterIds: [] }));
  parsed.goalId = "";
  parsed.teacherRationale = { goalUsed: "-", interestsUsed: [], strengthsUsed: [], supportsUsed: [], avoided: [], explanation: "Template" };
  delete parsed.optionalHomeActivity;
  return parsed;
}

/** Save a content item as an organization template, stripped of the child's personal data. */
export async function saveAsTemplate(actor: Actor, contentId: string) {
  const content = await authorizeContent(db, actor, contentId, "edit");
  const version = await db.contentVersion.findUnique({ where: { id: content.currentVersionId ?? "" } });
  if (!version) throw notFound("Content version");
  const child = content.childId ? await db.child.findUnique({ where: { id: content.childId } }) : null;
  const names = child ? [child.displayName, child.firstName, child.lastName ?? ""] : [];
  const body = anonymizeBody(version.body as unknown as ContentBody, names);
  const tpl = await db.contentTemplate.create({
    data: {
      organizationId: content.organizationId,
      type: content.type,
      language: content.language,
      title: body.title,
      domain: content.domain,
      ageBand: content.ageBand,
      body: body as unknown as Prisma.InputJsonValue,
      createdById: actor.userId,
    },
  });
  await audit(actor, "template.create", "ContentTemplate", tpl.id, { fromContent: content.id });
  return tpl;
}

/** Instantiate a template for a child — the only personal datum filled in is the display name. */
export async function createFromTemplate(actor: Actor, templateId: string, childId: string, goalId: string | null) {
  const child = await authorizeChild(db, actor, childId, "plan");
  const tpl = await db.contentTemplate.findFirst({
    where: { id: templateId, isActive: true, OR: [{ organizationId: null }, { organizationId: child.organizationId }] },
  });
  if (!tpl) throw notFound("Template");
  if (goalId) {
    const goal = await db.goal.findFirst({ where: { id: goalId, childId } });
    if (!goal) throw notFound("Goal");
  }
  const raw = JSON.stringify(tpl.body).split("{{child}}").join(child.displayName.replace(/"/g, ""));
  const parsed = contentBodySchema.safeParse({ ...JSON.parse(raw), goalId: goalId ?? "" });
  if (!parsed.success) throw new AppError("VALIDATION", "Template body is invalid");
  const body = validateBody(tpl.type, parsed.data);
  return db.$transaction(async (tx) => {
    const asset = await tx.contentAsset.create({
      data: {
        organizationId: child.organizationId,
        childId,
        goalId,
        classId: child.classId,
        type: tpl.type,
        language: tpl.language,
        title: body.title,
        status: "DRAFT",
        ageBand: tpl.ageBand,
        durationMinutes: body.durationMinutes,
        domain: tpl.domain,
        createdById: actor.userId,
      },
    });
    const version = await newVersion(tx, asset.id, body, "TEMPLATE", actor.userId);
    await tx.contentAsset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } });
    await audit(actor, "content.generate", "ContentAsset", asset.id, { template: tpl.id, childId }, tx);
    return asset;
  });
}

/** Published, child-facing content a given child may open (used by parent views too). */
export async function publishedForChild(childId: string, classId: string | null) {
  const items = await db.contentAsset.findMany({
    where: {
      status: "PUBLISHED",
      OR: [{ childId }, ...(classId ? [{ childId: null, classId }] : [])],
    },
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true, type: true, language: true, publishedAt: true, currentVersion: { select: { body: true } } },
  });
  return items.map((i) => {
    const body = i.currentVersion?.body as unknown as ContentBody | undefined;
    const illustration =
      body?.kind === "story"
        ? body.scenes[0]?.illustration
        : body?.kind === "routine"
          ? body.steps[0]?.illustration
          : body?.kind === "activity"
            ? body.rounds[0]?.options[0]?.illustration
            : "📘";
    return {
      id: i.id,
      title: i.title,
      type: i.type,
      kind: KIND_BY_TYPE[i.type],
      language: i.language,
      publishedAt: i.publishedAt,
      illustration: illustration ?? "📘",
      homeActivity: body?.optionalHomeActivity ?? null,
    };
  });
}

export async function listClassContent(actor: Actor, classId: string) {
  const cls = await db.class.findFirst({ where: { AND: [{ id: classId }, classScopeWhere(actor)] } });
  if (!cls) throw notFound("Class");
  return db.contentAsset.findMany({ where: { classId: cls.id }, orderBy: { updatedAt: "desc" }, take: 100 });
}

export type TemplateInput = z.infer<typeof templateSchema>;

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createObservation } from "@/server/services/observations";
import { createGoal, updateGoal } from "@/server/services/goals";
import { approveContent, generateForGoal, patchContent, publishContent, regenerateContent } from "@/server/services/content";
import { recordOutcome, getProgress } from "@/server/services/outcomes";
import { childContentItem, childHome, resolveChildSession, launchChildSession } from "@/server/services/child-mode";
import { ContentGenerationContextBuilder } from "@/server/services/generation-context";
import { saveQuestionnaire } from "@/server/services/questionnaires";
import { makeTenant, resetDb, TRANSITION_GOAL } from "../helpers/fixtures";

async function adamWithGoal() {
  const t = await makeTenant();
  await createObservation(t.teacher, t.child.id, {
    kind: "QUICK",
    context: "free_play",
    domains: ["PLAY"],
    observedBehavior: "Built with blocks for 25 minutes.",
    frequencyOrDuration: null,
    whatHappenedBefore: null,
    antecedentTags: ["unexpected_transition"],
    supportsTried: ["visual_countdown"],
    customSupport: null,
    outcome: "helped",
    strengthNoticed: null,
    strengthTags: ["persistence"],
    interestTags: ["vehicles", "building"],
    teacherNote: null,
    possiblePatterns: [{ category: "SENSORY", value: "noise_sensitive" }],
  });
  const goal = await createGoal(t.teacher, t.child.id, TRANSITION_GOAL);
  return { ...t, goal };
}

const gen = {
  contentType: "INTERACTIVE_STORY" as const,
  language: "en" as const,
  durationMinutes: 6,
  theme: null,
  characterAssetIds: [],
  teacherInstruction: null,
};

describe("goal → generation → review → approval → publication", () => {
  beforeEach(resetDb);

  it("enforces max 3 active goals (and re-activation counts)", async () => {
    const t = await makeTenant();
    const g1 = await createGoal(t.teacher, t.child.id, TRANSITION_GOAL);
    await createGoal(t.teacher, t.child.id, TRANSITION_GOAL);
    await createGoal(t.teacher, t.child.id, TRANSITION_GOAL);
    await expect(createGoal(t.teacher, t.child.id, TRANSITION_GOAL)).rejects.toMatchObject({ code: "GOAL_LIMIT" });
    await updateGoal(t.teacher, g1.id, { status: "PAUSED", parentFocus: undefined, parentReinforcement: undefined });
    await createGoal(t.teacher, t.child.id, TRANSITION_GOAL);
    await expect(updateGoal(t.teacher, g1.id, { status: "ACTIVE", parentFocus: undefined, parentReinforcement: undefined })).rejects.toMatchObject({
      code: "GOAL_LIMIT",
    });
  });

  it("goals cannot be supported by EMERGING attributes", async () => {
    const t = await adamWithGoal();
    const pending = await db.profileAttribute.findFirstOrThrow({ where: { childId: t.child.id, status: "PENDING_CONFIRMATION" } });
    await updateGoal(t.teacher, t.goal.id, { status: "CLOSED", parentFocus: undefined, parentReinforcement: undefined });
    await expect(createGoal(t.teacher, t.child.id, { ...TRANSITION_GOAL, evidenceAttributeIds: [pending.id] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("generates a DRAFT that a child cannot see until approved and published", async () => {
    const t = await adamWithGoal();
    const content = await generateForGoal(t.teacher, t.goal.id, gen);
    expect(content.status).toBe("DRAFT");
    expect(content.isDemoGenerated).toBe(true);
    const rationale = content.rationale as { interestsUsed: string[]; supportsUsed: string[] };
    expect(rationale.interestsUsed).toEqual(expect.arrayContaining(["vehicles"]));

    const token = await launchChildSession(t.teacher, t.child.id, "1234");
    const session = (await resolveChildSession(token))!;
    expect(await childHome(session)).toHaveLength(0);
    await expect(childContentItem(session, content.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // publish before approval is blocked (and audited)
    await expect(publishContent(t.teacher, content.id)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(await db.auditLog.count({ where: { action: "content.publish_blocked", objectId: content.id } })).toBe(1);

    await approveContent(t.teacher, content.id);
    await expect(childContentItem(session, content.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await publishContent(t.teacher, content.id);
    const item = await childContentItem(session, content.id);
    expect(item.body.kind).toBe("story");
    expect(await childHome(session)).toHaveLength(1);

    const actions = (await db.contentApproval.findMany({ where: { contentId: content.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["SUBMITTED_FOR_REVIEW", "APPROVED", "PUBLISHED"]);
    for (const a of ["content.generate", "content.approve", "content.publish"]) expect(await db.auditLog.count({ where: { action: a } })).toBeGreaterThan(0);
  });

  it("edits return published content to DRAFT (hidden from the child) and stale edits are rejected", async () => {
    const t = await adamWithGoal();
    const content = await generateForGoal(t.teacher, t.goal.id, gen);
    await approveContent(t.teacher, content.id);
    const published = await publishContent(t.teacher, content.id);
    const edited = await patchContent(t.teacher, content.id, { revision: published.revision, title: "A new title" });
    expect(edited.status).toBe("DRAFT");
    expect(edited.revision).toBe(published.revision + 1);
    await expect(patchContent(t.teacher, content.id, { revision: published.revision, title: "Stale" })).rejects.toMatchObject({ code: "STALE_EDIT" });
    // malformed / unsafe bodies are rejected
    await expect(patchContent(t.teacher, content.id, { revision: edited.revision, body: { kind: "story", title: "x" } })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("regenerates variations as new versions", async () => {
    const t = await adamWithGoal();
    const content = await generateForGoal(t.teacher, t.goal.id, gen);
    const r1 = await regenerateContent(t.teacher, content.id, { revision: content.revision, mode: "language", language: "ar", theme: null });
    expect(r1.language).toBe("ar");
    const r2 = await regenerateContent(t.teacher, content.id, { revision: r1.revision, mode: "remove_personalization", removeKeys: ["vehicles"], theme: null });
    expect((r2.rationale as { interestsUsed: string[] }).interestsUsed).not.toContain("vehicles");
    const r3 = await regenerateContent(t.teacher, content.id, { revision: r2.revision, mode: "scene", sceneId: "s1", theme: null });
    expect(await db.contentVersion.count({ where: { contentId: content.id } })).toBe(4);
    expect(r3.status).toBe("DRAFT");
  });

  it("goal → intervention → outcome → progress", async () => {
    const t = await adamWithGoal();
    const content = await generateForGoal(t.teacher, t.goal.id, gen);
    const { outcome } = await recordOutcome(t.teacher, t.goal.id, {
      result: "HELPED",
      contentId: content.id,
      support: "advance_warning",
      note: null,
      context: "transition",
      durationMinutes: 6,
      observationId: null,
    });
    expect(outcome.interventionId).not.toBeNull();
    const intervention = await db.intervention.findUniqueOrThrow({ where: { id: outcome.interventionId! } });
    expect(intervention.contentId).toBe(content.id);
    // helped support becomes evidence
    const support = await db.profileAttribute.findFirstOrThrow({ where: { childId: t.child.id, value: "advance_warning" }, include: { evidence: true } });
    expect(support.evidence.some((e) => e.sourceType === "OUTCOME")).toBe(true);
    // duplicate double-tap is ignored
    const dup = await recordOutcome(t.teacher, t.goal.id, {
      result: "HELPED",
      contentId: content.id,
      support: null,
      note: null,
      context: null,
      durationMinutes: null,
      observationId: null,
    });
    expect(dup.duplicate).toBe(true);
    const p = await getProgress(t.teacher, t.child.id);
    const g = p.goals.find((x) => x.id === t.goal.id)!;
    expect(g.counts.HELPED).toBe(1);
    expect(g.hasOutcomeBeforeReview).toBe(true);
  });
});

describe("AI data minimization", () => {
  beforeEach(resetDb);

  it("the generation context contains only approved, minimal fields", async () => {
    const t = await adamWithGoal();
    await saveQuestionnaire(t.parent, t.child.id, {
      submit: true,
      answers: {
        allergies: "Severe peanut allergy",
        family_context: "Parents recently separated",
        interests: { selected: ["music"], other: null },
        final_message: "He loves his grandma",
      },
    });
    const { context } = await new ContentGenerationContextBuilder(db).build(t.child.id, t.goal.id, {
      contentType: "INTERACTIVE_STORY",
      language: "ar",
      durationMinutes: 6,
      theme: null,
      teacherInstruction: null,
      characterAssetIds: [],
    });
    expect(Object.keys(context).sort()).toEqual(
      [
        "ageBand",
        "approvedCharacters",
        "avoid",
        "childDisplayName",
        "contentLanguage",
        "difficulty",
        "durationMinutes",
        "format",
        "goal",
        "goalId",
        "interests",
        "strengths",
        "successIndicator",
        "supports",
        "teacherInstruction",
        "theme",
      ].sort(),
    );
    const json = JSON.stringify(context);
    expect(json).not.toMatch(/peanut|separated|grandma|Haddad/i); // health, family, free text, last name
    expect(json).not.toMatch(/noise_sensitive/); // EMERGING attribute is never used
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no birth date — only an age band
    expect(context.interests.length).toBeLessThanOrEqual(2);
    expect(context.ageBand).toMatch(/^\d-\d$/);
  });

  it("rejects personalization items that are not confirmed in the profile", async () => {
    const t = await adamWithGoal();
    await expect(
      generateForGoal(t.teacher, t.goal.id, { ...gen, include: { interests: ["space"], strengths: [], supports: [], avoid: [] } }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("AI request logs store metadata only (no prompts)", async () => {
    const t = await adamWithGoal();
    await generateForGoal(t.teacher, t.goal.id, gen);
    const log = await db.aIRequestLog.findFirstOrThrow({ where: { operation: "generate_content" } });
    expect(log.provider).toBe("demo");
    expect(log.success).toBe(true);
    expect(Object.keys(log)).not.toContain("prompt");
  });
});

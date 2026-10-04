import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authorizeChild } from "@/lib/permissions";
import { getChild } from "@/server/services/children";
import { getInternalProfile } from "@/server/services/profile";
import { createGoal } from "@/server/services/goals";
import { generateForGoal, getContent, approveContent, publishContent } from "@/server/services/content";
import { createConsent, readMediaFile, revokeConsent, uploadMedia, listMedia } from "@/server/services/media";
import { ContentGenerationContextBuilder } from "@/server/services/generation-context";
import { childContentItem, exitChildSession, launchChildSession, resolveChildSession } from "@/server/services/child-mode";
import { listQuestionnairesForStaff, saveQuestionnaire } from "@/server/services/questionnaires";
import { createUser, updateUser } from "@/server/services/admin";
import { createObservation } from "@/server/services/observations";
import { makeTenant, PNG_1X1, resetDb, TRANSITION_GOAL } from "../helpers/fixtures";

const gen = {
  contentType: "INTERACTIVE_STORY" as const,
  language: "en" as const,
  durationMinutes: 5,
  theme: null,
  characterAssetIds: [] as string[],
  teacherInstruction: null,
};

describe("security & tenant isolation", () => {
  beforeEach(resetDb);

  it("a teacher cannot open a child from another kindergarten (404, not 403)", async () => {
    const t = await makeTenant();
    await expect(getChild(t.teacher, t.otherChild.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getInternalProfile(t.teacher, t.otherChild.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a parent cannot open another parent's child", async () => {
    const t = await makeTenant();
    await expect(getChild(t.parent, t.otherChild.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveQuestionnaire(t.parent, t.otherChild.id, { submit: false, answers: {} })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("cross-tenant ID guessing fails for every role", async () => {
    const a = await makeTenant("a");
    const b = await makeTenant("b");
    for (const actor of [a.teacher, a.parent, a.orgAdmin, a.kgAdmin]) {
      await expect(authorizeChild(db, actor, b.child.id, "view")).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    const goalB = await createGoal(b.teacher, b.child.id, TRANSITION_GOAL);
    const contentB = await generateForGoal(b.teacher, goalB.id, gen);
    await expect(getContent(a.teacher, contentB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getContent(a.orgAdmin, contentB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("generation cannot be invoked for an unauthorized child or by a parent", async () => {
    const a = await makeTenant("a");
    const goal = await createGoal(a.teacher, a.child.id, TRANSITION_GOAL);
    await expect(generateForGoal(a.otherTeacher, goal.id, gen)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(generateForGoal(a.parent, goal.id, gen)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createGoal(a.parent, a.child.id, TRANSITION_GOAL)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("parents only see published content of their child; never drafts", async () => {
    const t = await makeTenant();
    const goal = await createGoal(t.teacher, t.child.id, TRANSITION_GOAL);
    const c = await generateForGoal(t.teacher, goal.id, gen);
    await expect(getContent(t.parent, c.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await approveContent(t.teacher, c.id);
    await publishContent(t.teacher, c.id);
    const visible = await getContent(t.parent, c.id);
    expect(visible).not.toHaveProperty("generationContext");
    expect(visible).not.toHaveProperty("rationale");
  });

  it("sensitive answers: visible to the class teacher (audited), hidden from org admins", async () => {
    const t = await makeTenant();
    await saveQuestionnaire(t.parent, t.child.id, { submit: true, answers: { allergies: "Peanuts" } });
    const forTeacher = await listQuestionnairesForStaff(t.teacher, t.child.id);
    expect(forTeacher[0]!.sensitiveAnswers).toMatchObject({ allergies: "Peanuts" });
    expect(await db.auditLog.count({ where: { action: "questionnaire.sensitive_view" } })).toBe(1);
    const forAdmin = await listQuestionnairesForStaff(t.orgAdmin, t.child.id);
    expect(forAdmin[0]!.sensitiveAnswers).toBeNull();
    expect(JSON.stringify(forAdmin)).not.toMatch(/Peanuts/);
  });

  it("child sessions cannot read other children's content or drafts and need the PIN to exit", async () => {
    const t = await makeTenant();
    const goal = await createGoal(t.teacher, t.child.id, TRANSITION_GOAL);
    const draft = await generateForGoal(t.teacher, goal.id, gen);
    const token = await launchChildSession(t.parent, t.child.id, "4321");
    const session = (await resolveChildSession(token))!;
    await expect(childContentItem(session, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(exitChildSession(token, "0000")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await resolveChildSession(token)).not.toBeNull();
    await exitChildSession(token, "4321");
    expect(await resolveChildSession(token)).toBeNull();
  });

  it("locks the PIN exit after repeated failures", async () => {
    const t = await makeTenant();
    const token = await launchChildSession(t.teacher, t.child.id, "4321");
    for (let i = 0; i < 5; i++) await expect(exitChildSession(token, "0000")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exitChildSession(token, "4321")).rejects.toMatchObject({ code: "LOCKED" });
  });

  it("admins cannot grant roles above their own or change their own role", async () => {
    const t = await makeTenant();
    await expect(
      createUser(t.kgAdmin, { email: "x@t.local", name: "X", role: "ORGANIZATION_ADMIN", password: "longpassword1", uiLocale: "en" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createUser(t.orgAdmin, { email: "y@t.local", name: "Y", role: "SUPER_ADMIN", password: "longpassword1", uiLocale: "en" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateUser(t.orgAdmin, t.orgAdmin.userId, { role: "SUPER_ADMIN" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const teacher = await createUser(t.kgAdmin, { email: "z@t.local", name: "Z", role: "TEACHER", password: "longpassword1", uiLocale: "en" });
    expect(teacher.role).toBe("TEACHER");
    expect(await db.auditLog.count({ where: { action: "user.create" } })).toBe(1);
  });

  it("observations are teacher-only", async () => {
    const t = await makeTenant();
    await expect(
      createObservation(t.parent, t.child.id, {
        kind: "QUICK",
        context: "yard",
        domains: ["SOCIAL"],
        observedBehavior: "Played",
        frequencyOrDuration: null,
        whatHappenedBefore: null,
        antecedentTags: [],
        supportsTried: [],
        customSupport: null,
        outcome: "not_assessed",
        strengthNoticed: null,
        strengthTags: [],
        interestTags: [],
        teacherNote: null,
        possiblePatterns: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("media consent", () => {
  beforeEach(resetDb);

  it("consent revoke → character no longer selectable, file inaccessible, generation refused", async () => {
    const t = await makeTenant();
    const media = await uploadMedia(
      t.parent,
      t.child.id,
      { data: PNG_1X1, type: "image/png", size: PNG_1X1.length },
      { personRelation: "MOTHER", personLabel: "Mama" },
    );
    expect(media).not.toHaveProperty("storageKey");
    const builder = new ContentGenerationContextBuilder(db);

    // uploaded but no consent → not selectable, not visible to staff
    expect(await builder.selectableCharacters(t.child.id, "INTERACTIVE_STORY")).toHaveLength(0);
    expect(await listMedia(t.teacher, t.child.id)).toHaveLength(0);
    await expect(readMediaFile({ actor: t.teacher }, media.id)).rejects.toMatchObject({ code: "CONSENT_REVOKED" });

    const consent = await createConsent(t.parent, t.child.id, {
      mediaAssetId: media.id,
      personRelation: "MOTHER",
      personLabel: "Mama",
      allowedPurposes: ["CHARACTER_INSPIRATION"],
      allowedContentTypes: ["INTERACTIVE_STORY"],
    });
    expect((await builder.selectableCharacters(t.child.id, "INTERACTIVE_STORY")).map((c) => c.id)).toEqual([media.id]);
    expect(await builder.selectableCharacters(t.child.id, "VISUAL_ROUTINE")).toHaveLength(0); // type not consented
    expect((await readMediaFile({ actor: t.teacher }, media.id)).data.equals(PNG_1X1)).toBe(true);

    const goal = await createGoal(t.teacher, t.child.id, TRANSITION_GOAL);
    const withChar = await generateForGoal(t.teacher, goal.id, { ...gen, characterAssetIds: [media.id] });
    const ctx = withChar.generationContext as { approvedCharacters: { label: string }[] };
    expect(ctx.approvedCharacters[0]!.label).toBe("Mom"); // relation label, not the family's name for the person

    await revokeConsent(t.parent, consent.id);
    expect(await builder.selectableCharacters(t.child.id, "INTERACTIVE_STORY")).toHaveLength(0);
    await expect(readMediaFile({ actor: t.teacher }, media.id)).rejects.toMatchObject({ code: "CONSENT_REVOKED" });
    await expect(generateForGoal(t.teacher, goal.id, { ...gen, characterAssetIds: [media.id] })).rejects.toMatchObject({ code: "CONSENT_REVOKED" });
    // approving content that still references the revoked character is blocked
    await expect(approveContent(t.teacher, withChar.id)).rejects.toMatchObject({ code: "CONSENT_REVOKED" });
    // the parent can still see their own upload to manage it
    expect((await readMediaFile({ actor: t.parent }, media.id)).mimeType).toBe("image/png");
    for (const a of ["media.upload", "consent.create", "consent.revoke"]) expect(await db.auditLog.count({ where: { action: a } })).toBe(1);
  });

  it("rejects files whose content does not match the declared type", async () => {
    const t = await makeTenant();
    const fake = Buffer.from("<svg onload=alert(1)>");
    await expect(
      uploadMedia(t.parent, t.child.id, { data: fake, type: "image/png", size: fake.length }, { personRelation: "CHILD", personLabel: "Me" }),
    ).rejects.toMatchObject({ code: "UPLOAD_FAILED" });
  });

  it("teachers cannot upload or grant consent on behalf of a family", async () => {
    const t = await makeTenant();
    await expect(
      uploadMedia(t.teacher, t.child.id, { data: PNG_1X1, type: "image/png", size: PNG_1X1.length }, { personRelation: "CHILD", personLabel: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a child session can only load a character image used in its own published content", async () => {
    const t = await makeTenant();
    const media = await uploadMedia(
      t.parent,
      t.child.id,
      { data: PNG_1X1, type: "image/png", size: PNG_1X1.length },
      { personRelation: "CHILD", personLabel: "Adam" },
    );
    await createConsent(t.parent, t.child.id, {
      mediaAssetId: media.id,
      personRelation: "CHILD",
      personLabel: "Adam",
      allowedPurposes: ["CHARACTER_INSPIRATION"],
      allowedContentTypes: ["INTERACTIVE_STORY"],
    });
    const session = (await resolveChildSession(await launchChildSession(t.parent, t.child.id, "1111")))!;
    await expect(readMediaFile({ child: session }, media.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const goal = await createGoal(t.teacher, t.child.id, TRANSITION_GOAL);
    const c = await generateForGoal(t.teacher, goal.id, { ...gen, characterAssetIds: [media.id] });
    await approveContent(t.teacher, c.id);
    await publishContent(t.teacher, c.id);
    expect((await readMediaFile({ child: session }, media.id)).mimeType).toBe("image/png");
  });
});

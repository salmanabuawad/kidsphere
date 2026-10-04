import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveQuestionnaire } from "@/server/services/questionnaires";
import { createObservation } from "@/server/services/observations";
import { confirmAttribute, getInternalProfile, retireAttribute, suggestAttributesFromObservation } from "@/server/services/profile";
import { makeTenant, resetDb } from "../helpers/fixtures";

const quick = (over: Record<string, unknown> = {}) => ({
  kind: "QUICK" as const,
  context: "transition" as const,
  domains: ["ATTENTION_EF" as const],
  observedBehavior: "Two-minute visual countdown helped him move to group time.",
  frequencyOrDuration: null,
  whatHappenedBefore: null,
  antecedentTags: [] as string[],
  supportsTried: [] as string[],
  customSupport: null,
  outcome: "not_assessed" as const,
  strengthNoticed: null,
  strengthTags: [] as string[],
  interestTags: [] as string[],
  teacherNote: null,
  possiblePatterns: [] as { category: "LEARNING_PREFERENCE"; value: string }[],
  ...over,
});

describe("profile flows", () => {
  beforeEach(resetDb);

  it("parent questionnaire → REPORTED profile with provenance; health answers excluded", async () => {
    const t = await makeTenant();
    await saveQuestionnaire(t.parent, t.child.id, {
      submit: true,
      answers: {
        interests: { selected: ["vehicles", "building"], other: null },
        preparation_helps: "yes",
        stopping_activity: "needs_preparation",
        preparation_what: { selected: ["advance_warning"], other: null },
        allergies: "Peanuts",
      },
    });
    const { attributes } = await getInternalProfile(t.teacher, t.child.id);
    const vehicles = attributes.find((a) => a.value === "vehicles")!;
    expect(vehicles.confidence).toBe("REPORTED");
    expect(vehicles.status).toBe("ACTIVE");
    expect(vehicles.evidence[0]!.sourceType).toBe("PARENT_QUESTIONNAIRE");
    // every attribute has provenance
    expect(attributes.every((a) => a.evidence.length > 0)).toBe(true);
    // health answer stored as sensitive, never a profile attribute
    const allergy = await db.parentResponse.findFirst({ where: { questionKey: "allergies" } });
    expect(allergy?.isSensitive).toBe(true);
    expect(attributes.some((a) => /peanut/i.test(a.value))).toBe(false);
  });

  it("save-and-resume keeps answers and section; resubmission is idempotent", async () => {
    const t = await makeTenant();
    await saveQuestionnaire(t.parent, t.child.id, { submit: false, currentSection: "interests", answers: { interests: { selected: ["music"], other: null } } });
    const q = await db.parentQuestionnaire.findFirstOrThrow({ where: { childId: t.child.id } });
    expect(q.status).toBe("IN_PROGRESS");
    expect(q.currentSection).toBe("interests");
    await saveQuestionnaire(t.parent, t.child.id, { submit: true, answers: {} });
    await saveQuestionnaire(t.parent, t.child.id, { submit: true, answers: {} });
    const attr = await db.profileAttribute.findFirstOrThrow({ where: { childId: t.child.id, value: "music" }, include: { evidence: true } });
    expect(attr.evidence).toHaveLength(1);
  });

  it("teacher observation → OBSERVED; parent + teacher → CORROBORATED (Adam scenario)", async () => {
    const t = await makeTenant();
    await saveQuestionnaire(t.parent, t.child.id, {
      submit: true,
      answers: {
        interests: { selected: ["vehicles"], other: null },
        preparation_helps: "yes",
        stopping_activity: "needs_preparation",
        preparation_what: { selected: ["advance_warning"], other: null },
      },
    });
    await createObservation(
      t.teacher,
      t.child.id,
      quick({
        supportsTried: ["visual_countdown", "advance_warning"],
        outcome: "helped",
        interestTags: ["vehicles"],
        strengthTags: ["persistence"],
        antecedentTags: ["unexpected_transition"],
      }),
    );
    const { attributes } = await getInternalProfile(t.teacher, t.child.id);
    const conf = (v: string) => attributes.find((a) => a.value === v)?.confidence;
    expect(conf("vehicles")).toBe("CORROBORATED");
    expect(conf("advance_warning")).toBe("CORROBORATED");
    expect(conf("visual_countdown")).toBe("OBSERVED");
    expect(conf("persistence")).toBe("OBSERVED");
    expect(conf("unexpected_transition")).toBe("OBSERVED");
  });

  it("possible pattern → EMERGING candidate; teacher confirmation → active attribute", async () => {
    const t = await makeTenant();
    await createObservation(t.teacher, t.child.id, quick({ possiblePatterns: [{ category: "LEARNING_PREFERENCE", value: "visual" }] }));
    let attr = await db.profileAttribute.findFirstOrThrow({ where: { childId: t.child.id, value: "visual" } });
    expect(attr.status).toBe("PENDING_CONFIRMATION");
    expect(attr.confidence).toBe("EMERGING");
    await confirmAttribute(t.teacher, t.child.id, attr.id);
    attr = await db.profileAttribute.findFirstOrThrow({ where: { id: attr.id } });
    expect(attr.status).toBe("ACTIVE");
    expect(attr.confidence).toBe("OBSERVED");
    expect(attr.confirmedById).toBe(t.teacher.userId);
    const log = await db.auditLog.findFirst({ where: { action: "profile_attribute.confirm", objectId: attr.id } });
    expect(log).not.toBeNull();
  });

  it("AI suggestions are created as pending and never active", async () => {
    const t = await makeTenant();
    const { observation } = await createObservation(t.teacher, t.child.id, quick({ observedBehavior: "Adam built a tall block tower for a long time." }));
    const res = await suggestAttributesFromObservation(t.teacher, t.child.id, observation.id);
    expect(res.suggestions.length).toBeGreaterThan(0);
    const attrs = await db.profileAttribute.findMany({ where: { childId: t.child.id } });
    expect(attrs.length).toBeGreaterThan(0);
    expect(attrs.every((a) => a.status === "PENDING_CONFIRMATION" && a.confidence === "EMERGING")).toBe(true);
    const log = await db.aIRequestLog.findFirstOrThrow({ where: { operation: "suggest_attributes" } });
    expect(log.success).toBe(true);
  });

  it("retiring a pending attribute rejects it; retiring an active one retires it", async () => {
    const t = await makeTenant();
    await createObservation(
      t.teacher,
      t.child.id,
      quick({ strengthTags: ["kindness"], possiblePatterns: [{ category: "LEARNING_PREFERENCE", value: "visual" }] }),
    );
    const pending = await db.profileAttribute.findFirstOrThrow({ where: { value: "visual" } });
    const active = await db.profileAttribute.findFirstOrThrow({ where: { value: "kindness" } });
    expect((await retireAttribute(t.teacher, t.child.id, pending.id)).status).toBe("REJECTED");
    expect((await retireAttribute(t.teacher, t.child.id, active.id)).status).toBe("RETIRED");
  });

  it("duplicate observation submission with the same client id is stored once", async () => {
    const t = await makeTenant();
    await createObservation(t.teacher, t.child.id, quick({ clientRequestId: "req-1" }));
    const second = await createObservation(t.teacher, t.child.id, quick({ clientRequestId: "req-1" }));
    expect(second.duplicate).toBe(true);
    expect(await db.observation.count({ where: { childId: t.child.id } })).toBe(1);
  });
});

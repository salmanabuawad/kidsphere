import { describe, expect, it } from "vitest";
import { computeConfidence, nextStatus, observationCandidates, questionnaireCandidates } from "@/features/child-understanding/engine";

const ev = (sourceType: "PARENT_QUESTIONNAIRE" | "TEACHER_OBSERVATION" | "TEACHER_ENTRY" | "OUTCOME" | "AI_SUGGESTION", sourceId = "x") => ({
  sourceType,
  sourceId,
});

describe("profile confidence calculation", () => {
  it("single parent report → REPORTED", () => {
    expect(computeConfidence([ev("PARENT_QUESTIONNAIRE")], "ACTIVE")).toBe("REPORTED");
  });
  it("direct teacher observation → OBSERVED", () => {
    expect(computeConfidence([ev("TEACHER_OBSERVATION")], "ACTIVE")).toBe("OBSERVED");
  });
  it("parent + teacher evidence → CORROBORATED", () => {
    expect(computeConfidence([ev("PARENT_QUESTIONNAIRE"), ev("TEACHER_OBSERVATION")], "ACTIVE")).toBe("CORROBORATED");
  });
  it("repeated independent observations → CORROBORATED, but the same observation twice does not count twice", () => {
    expect(computeConfidence([ev("TEACHER_OBSERVATION", "a"), ev("TEACHER_OBSERVATION", "b")], "ACTIVE")).toBe("CORROBORATED");
    expect(computeConfidence([ev("TEACHER_OBSERVATION", "a"), ev("TEACHER_OBSERVATION", "a")], "ACTIVE")).toBe("OBSERVED");
  });
  it("pending items are EMERGING and retired items RETIRED regardless of evidence", () => {
    expect(computeConfidence([ev("PARENT_QUESTIONNAIRE"), ev("TEACHER_OBSERVATION")], "PENDING_CONFIRMATION")).toBe("EMERGING");
    expect(computeConfidence([ev("TEACHER_OBSERVATION")], "RETIRED")).toBe("RETIRED");
  });
  it("AI suggestions alone never raise confidence", () => {
    expect(computeConfidence([ev("AI_SUGGESTION"), ev("AI_SUGGESTION", "y")], "ACTIVE")).toBe("EMERGING");
  });
});

describe("status transitions", () => {
  it("creates pending attributes from possible patterns / AI and active ones from direct evidence", () => {
    expect(nextStatus(null, { sourceType: "AI_SUGGESTION", pending: true })).toBe("PENDING_CONFIRMATION");
    expect(nextStatus(null, { sourceType: "TEACHER_OBSERVATION", pending: false })).toBe("ACTIVE");
  });
  it("never activates an EMERGING attribute from parent or AI evidence", () => {
    expect(nextStatus("PENDING_CONFIRMATION", { sourceType: "PARENT_QUESTIONNAIRE", pending: false })).toBe("PENDING_CONFIRMATION");
    expect(nextStatus("PENDING_CONFIRMATION", { sourceType: "AI_SUGGESTION", pending: true })).toBe("PENDING_CONFIRMATION");
  });
  it("never reverses a teacher's retire decision automatically", () => {
    expect(nextStatus("RETIRED", { sourceType: "TEACHER_OBSERVATION", pending: false })).toBe("RETIRED");
    expect(nextStatus("REJECTED", { sourceType: "PARENT_QUESTIONNAIRE", pending: false })).toBe("REJECTED");
  });
});

describe("questionnaire → candidates", () => {
  it("normalizes the Adam scenario", () => {
    const c = questionnaireCandidates({
      interests: { selected: ["vehicles", "building", "other"], other: "trains" },
      stopping_activity: "needs_preparation",
      preparation_helps: "yes",
      preparation_what: { selected: ["advance_warning", "explain_next_step"] },
      sensory_reactions: { selected: ["noise"] },
      allergies: "peanuts",
    });
    const keys = c.map((x) => `${x.category}:${x.value}`);
    expect(keys).toEqual(
      expect.arrayContaining([
        "INTEREST:vehicles",
        "INTEREST:building",
        "TRIGGER:stopping_preferred_activity",
        "SUPPORT:advance_warning",
        "SUPPORT:explain_next_step",
        "SENSORY:noise_sensitive",
        "TRIGGER:loud_surprise_sounds",
      ]),
    );
    // free text ("other") and health answers never become attributes
    expect(keys.join(",")).not.toMatch(/trains|peanut|allerg/);
  });
  it("ignores unknown values", () => {
    expect(questionnaireCandidates({ interests: { selected: ["not_a_real_interest"] } })).toEqual([]);
  });
  it("does not record preparation supports when the parent says preparation does not help", () => {
    const c = questionnaireCandidates({ preparation_helps: "no", preparation_what: { selected: ["advance_warning"] } });
    expect(c.some((x) => x.value === "advance_warning")).toBe(false);
  });
});

describe("observation → candidates", () => {
  it("records helped supports, strengths, interests and triggers as direct evidence", () => {
    const { direct, pending } = observationCandidates({
      supportsTried: ["visual_countdown"],
      outcome: "helped",
      strengthTags: ["persistence"],
      interestTags: ["building"],
      antecedentTags: ["unexpected_transition"],
      possiblePatterns: [{ category: "LEARNING_PREFERENCE", value: "visual" }],
    });
    expect(direct.map((d) => d.value).sort()).toEqual(["building", "persistence", "unexpected_transition", "visual_countdown"]);
    expect(pending).toEqual([{ category: "LEARNING_PREFERENCE", value: "visual" }]);
  });
  it("does not treat a support that did not help as a support", () => {
    const { direct } = observationCandidates({
      supportsTried: ["countdown"],
      outcome: "did_not_help",
      strengthTags: [],
      interestTags: [],
      possiblePatterns: [],
    });
    expect(direct).toEqual([]);
  });
});

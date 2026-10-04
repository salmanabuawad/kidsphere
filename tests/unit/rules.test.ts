import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { assertCanAddActiveGoal, becomesActive, MAX_ACTIVE_GOALS } from "@/features/goals/rules";
import { canTransition, isVisibleToChild, nextContentStatus } from "@/features/content/workflow";
import { evaluateConsent, type ConsentLike } from "@/features/consent/evaluate";
import { canPerform, childScopeWhere } from "@/lib/permissions";
import type { Actor } from "@/lib/auth/actor";

describe("goal max-3 rule", () => {
  it("allows up to three active goals", () => {
    expect(MAX_ACTIVE_GOALS).toBe(3);
    expect(() => assertCanAddActiveGoal(0)).not.toThrow();
    expect(() => assertCanAddActiveGoal(2)).not.toThrow();
  });
  it("rejects a fourth active goal with GOAL_LIMIT", () => {
    try {
      assertCanAddActiveGoal(3);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("GOAL_LIMIT");
    }
  });
  it("treats re-activation as adding an active goal", () => {
    expect(becomesActive("PAUSED", "ACTIVE")).toBe(true);
    expect(becomesActive("ACTIVE", "ACTIVE")).toBe(false);
    expect(becomesActive("ACTIVE", "CLOSED")).toBe(false);
  });
});

describe("teacher approval gate & publishing rules", () => {
  it("follows DRAFT → TEACHER_REVIEW → APPROVED → PUBLISHED", () => {
    expect(nextContentStatus("DRAFT", "submit_review")).toBe("TEACHER_REVIEW");
    expect(nextContentStatus("TEACHER_REVIEW", "approve")).toBe("APPROVED");
    expect(nextContentStatus("APPROVED", "publish")).toBe("PUBLISHED");
    expect(nextContentStatus("PUBLISHED", "archive")).toBe("ARCHIVED");
  });
  it("never publishes unapproved content", () => {
    for (const s of ["DRAFT", "TEACHER_REVIEW", "ARCHIVED", "PUBLISHED"] as const) {
      expect(canTransition(s, "publish")).toBe(false);
      expect(() => nextContentStatus(s, "publish")).toThrow(/approved/i);
    }
  });
  it("returns edited content to DRAFT and blocks edits to archived content", () => {
    expect(nextContentStatus("PUBLISHED", "edit")).toBe("DRAFT");
    expect(nextContentStatus("APPROVED", "edit")).toBe("DRAFT");
    expect(() => nextContentStatus("ARCHIVED", "edit")).toThrow();
  });
  it("only PUBLISHED content is ever visible to a child", () => {
    expect(isVisibleToChild("PUBLISHED")).toBe(true);
    for (const s of ["DRAFT", "TEACHER_REVIEW", "APPROVED", "ARCHIVED"] as const) expect(isVisibleToChild(s)).toBe(false);
  });
});

describe("consent evaluation", () => {
  const granted: ConsentLike = { status: "GRANTED", allowedPurposes: ["CHARACTER_INSPIRATION"], allowedContentTypes: ["INTERACTIVE_STORY"], revokedAt: null };
  it("requires explicit consent — upload alone is not enough", () => {
    expect(evaluateConsent([], "CHARACTER_INSPIRATION", "INTERACTIVE_STORY")).toEqual({ allowed: false, reason: "NO_CONSENT" });
  });
  it("allows a matching purpose and content type", () => {
    expect(evaluateConsent([granted], "CHARACTER_INSPIRATION", "INTERACTIVE_STORY").allowed).toBe(true);
  });
  it("rejects other purposes, other content types, revoked consent and deleted assets", () => {
    expect(evaluateConsent([granted], "STORY_ILLUSTRATION", "INTERACTIVE_STORY")).toMatchObject({ reason: "PURPOSE_NOT_ALLOWED" });
    expect(evaluateConsent([granted], "CHARACTER_INSPIRATION", "VISUAL_ROUTINE")).toMatchObject({ reason: "TYPE_NOT_ALLOWED" });
    expect(evaluateConsent([{ ...granted, status: "REVOKED", revokedAt: new Date() }], "CHARACTER_INSPIRATION", "INTERACTIVE_STORY")).toMatchObject({
      reason: "REVOKED",
    });
    expect(evaluateConsent([granted], "CHARACTER_INSPIRATION", "INTERACTIVE_STORY", true)).toMatchObject({ reason: "ASSET_DELETED" });
  });
});

describe("tenant authorization scoping", () => {
  const base: Actor = { userId: "u1", role: "TEACHER", organizationId: "org1", kindergartenId: "kg1", name: "T", email: "t@x", uiLocale: "en" };
  it("always constrains non-super-admins to their organization", () => {
    for (const role of ["ORGANIZATION_ADMIN", "KINDERGARTEN_ADMIN", "TEACHER", "PARENT"] as const) {
      expect(childScopeWhere({ ...base, role })).toMatchObject({ organizationId: "org1" });
    }
  });
  it("scopes teachers to assigned classes and parents to linked children", () => {
    expect(childScopeWhere(base)).toEqual({ organizationId: "org1", class: { teachers: { some: { userId: "u1" } } } });
    expect(childScopeWhere({ ...base, role: "PARENT" })).toEqual({ organizationId: "org1", parents: { some: { parentId: "u1" } } });
    expect(childScopeWhere({ ...base, role: "KINDERGARTEN_ADMIN" })).toEqual({ organizationId: "org1", kindergartenId: "kg1" });
  });
  it("rejects an actor without an organization", () => {
    expect(() => childScopeWhere({ ...base, organizationId: null })).toThrow();
  });
  it("encodes the role/action matrix", () => {
    expect(canPerform("TEACHER", "plan")).toBe(true);
    expect(canPerform("PARENT", "plan")).toBe(false);
    expect(canPerform("PARENT", "viewInternal")).toBe(false);
    expect(canPerform("PARENT", "parentContribute")).toBe(true);
    expect(canPerform("TEACHER", "parentContribute")).toBe(false);
    expect(canPerform("ORGANIZATION_ADMIN", "viewSensitive")).toBe(false);
  });
});

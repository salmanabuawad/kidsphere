import { matchPath } from "react-router";
import { describe, expect, it } from "vitest";
import { CHILD_TABS, childTabPath, paths, routePatterns } from "./paths";

/** WP1-FE: the path builders and route patterns of the source-document workflow; existing routes unchanged. */

describe("existing routes are unchanged", () => {
  it("keeps every earlier route pattern", () => {
    expect(routePatterns).toMatchObject({
      home: "/",
      login: "/login",
      account: "/account",
      children: "/children",
      newChild: "/children/new",
      child: "/children/:id",
      childEdit: "/children/:id/edit/:step",
      childFocus: "/children/:id/focus",
      childObserve: "/children/:id/observe",
      observe: "/observe",
      childTimeline: "/children/:id/timeline",
      childContent: "/children/:id/content",
      newContent: "/children/:id/content/new",
      content: "/content/:id",
      presentContent: "/content/:id/present",
      pack: "/packs/:packId",
      childDevelopment: "/children/:id/development",
      newReview: "/children/:id/review/new",
      adminUsers: "/admin/users",
      adminClasses: "/admin/classes",
      adminChildParents: "/admin/children/:id/parents",
      parentHome: "/parent",
      parentOnboarding: "/parent/children/:id/onboarding",
      parentChildContent: "/parent/children/:id/content",
      parentContent: "/parent/content/:id",
    });
  });

  it("keeps every earlier builder's output", () => {
    expect(paths.child("c1")).toBe("/children/c1");
    expect(paths.childEdit("c1")).toBe("/children/c1/edit/1");
    expect(paths.childEdit("c1", "review")).toBe("/children/c1/edit/review");
    expect(paths.childFocus("c1")).toBe("/children/c1/focus");
    expect(paths.childObserve("c1")).toBe("/children/c1/observe");
    expect(paths.childTimeline("c1")).toBe("/children/c1/timeline");
    expect(paths.childContent("c1")).toBe("/children/c1/content");
    expect(paths.newContent("c1", { mode: "growth_support", focus: "f1" })).toBe("/children/c1/content/new?mode=growth_support&focus=f1");
    expect(paths.childDevelopment("c1")).toBe("/children/c1/development");
    expect(paths.newReview("c1")).toBe("/children/c1/review/new");
    expect(paths.parentOnboarding("c1")).toBe("/parent/children/c1/onboarding");
    expect(paths.login("/children/1")).toBe("/login?next=%2Fchildren%2F1");
  });
});

describe("source-document routes (COVERAGE-MATRIX §5)", () => {
  it("builds the 6 new child routes", () => {
    expect(paths.childParentView("c1")).toBe("/children/c1/parent-view");
    expect(paths.childQuickBaseline("c1")).toBe("/children/c1/quick-baseline");
    expect(paths.childTeacherObservation("c1")).toBe("/children/c1/teacher-observation");
    expect(paths.childPlan("c1")).toBe("/children/c1/plan");
    expect(paths.childObservations("c1")).toBe("/children/c1/observations");
    expect(paths.childReports("c1")).toBe("/children/c1/reports");
  });

  it("builds the wizard, detail and timeline routes", () => {
    expect(paths.childParentAnswers("c1")).toBe("/children/c1/parent-view/answers/1?mode=on_behalf");
    expect(paths.childParentAnswers("c1", 4, "meeting")).toBe("/children/c1/parent-view/answers/4?mode=meeting");
    expect(paths.parentOnboardingStep("c1", 9)).toBe("/parent/children/c1/onboarding/9");
    expect(paths.childObservation("c1", "o 2")).toBe("/children/c1/observations/o%202");
    expect(paths.childDevelopmentTimeline("c1")).toBe("/children/c1/development/timeline");
  });

  it("adds filters as a query string, skipping empty values and repeating arrays", () => {
    expect(paths.childObservations("c1", { domain: "social", date_from: "2026-09-01", focus_area_id: undefined, context: "", source: null })).toBe(
      "/children/c1/observations?domain=social&date_from=2026-09-01",
    );
    expect(paths.childDevelopmentTimeline("c1", { type: ["baseline", "review"], result: "worked_well" })).toBe(
      "/children/c1/development/timeline?type=baseline&type=review&result=worked_well",
    );
    expect(paths.childReports("c1", { type: "intervention_plan" })).toBe("/children/c1/reports?type=intervention_plan");
    expect(paths.childTeacherObservation("c1", { cycle: "a1", domain: "play" })).toBe("/children/c1/teacher-observation?cycle=a1&domain=play");
    expect(paths.childPlan("c1", {})).toBe("/children/c1/plan");
    expect(paths.childParentView("c1", { section: "heart" })).toBe("/children/c1/parent-view?section=heart");
  });

  it("encodes ids", () => {
    expect(paths.childPlan("a/b?c")).toBe("/children/a%2Fb%3Fc/plan");
  });

  it("every new builder matches its route pattern with the right params", () => {
    const cases: [string, string, Record<string, string>][] = [
      [routePatterns.childParentView, paths.childParentView("c1"), { id: "c1" }],
      [routePatterns.childParentAnswers, paths.childParentAnswers("c1", 3, "meeting"), { id: "c1", step: "3" }],
      [routePatterns.childQuickBaseline, paths.childQuickBaseline("c1"), { id: "c1" }],
      [routePatterns.childTeacherObservation, paths.childTeacherObservation("c1", { domain: "social" }), { id: "c1" }],
      [routePatterns.childPlan, paths.childPlan("c1"), { id: "c1" }],
      [routePatterns.childObservations, paths.childObservations("c1", { domain: "play" }), { id: "c1" }],
      [routePatterns.childObservation, paths.childObservation("c1", "o9"), { id: "c1", observationId: "o9" }],
      [routePatterns.childDevelopmentTimeline, paths.childDevelopmentTimeline("c1"), { id: "c1" }],
      [routePatterns.childReports, paths.childReports("c1", { type: "full" }), { id: "c1" }],
      [routePatterns.parentOnboardingStep, paths.parentOnboardingStep("c1", 2), { id: "c1", step: "2" }],
    ];
    for (const [pattern, built, params] of cases) {
      const m = matchPath(pattern, built.split("?")[0]!);
      expect(m, `${built} ~ ${pattern}`).not.toBeNull();
      expect(m!.params).toEqual(params);
    }
  });

  it("new child routes do not shadow the existing ones", () => {
    expect(matchPath(routePatterns.childObservations, paths.childObserve("c1"))).toBeNull();
    expect(matchPath(routePatterns.childDevelopmentTimeline, paths.childDevelopment("c1"))).toBeNull();
    expect(matchPath(routePatterns.childParentView, paths.childParentAnswers("c1").split("?")[0]!)).toBeNull();
  });

  it("lists the 8 child tabs in logical order with their paths", () => {
    expect(CHILD_TABS).toEqual(["overview", "parentView", "teacherObservation", "plan", "activities", "observations", "development", "reports"]);
    expect(CHILD_TABS.map((t) => childTabPath(t, "c1"))).toEqual([
      "/children/c1",
      "/children/c1/parent-view",
      "/children/c1/teacher-observation",
      "/children/c1/plan",
      "/children/c1/content",
      "/children/c1/observations",
      "/children/c1/development",
      "/children/c1/reports",
    ]);
  });
});

/**
 * Source-document integration (WP3-INT): every page the coverage matrix places in the UI
 * (COVERAGE-MATRIX §0.3, §5) is a registered route, the child tabs (WP2-NAV) and the
 * cross-feature links of the parent questionnaire (WP2-PQ), teacher observation (WP2-TO),
 * plan (WP2-PLAN) and reports (WP2-PDF) land on a real page instead of the 404, and the old
 * addresses redirect to their new tabs.
 */
import { waitFor } from "@testing-library/react";
import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";
import { CHILD_TABS, childTabPath, paths, routePatterns } from "@/lib/paths";
import { buildRouteObjects, featureRoutes } from "@/routes";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";

type Dict = { [key: string]: string | Dict };
const messages = import.meta.glob<Dict>("../i18n/messages/*/*.json", { eager: true, import: "default" });

function message(locale: string, ns: string, key: string): string | undefined {
  let node: string | Dict | undefined = messages[`../i18n/messages/${locale}/${ns}.json`];
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  return typeof node === "string" ? node : undefined;
}

const tree = buildRouteObjects(featureRoutes);

/** The registered pattern a URL lands on, or null for the 404 / no match. */
function landsOn(url: string): string | null {
  const matches = matchRoutes(tree, url.split("?")[0]!);
  const leaf = matches?.[matches.length - 1]?.route;
  return leaf && leaf.path && leaf.path !== "*" ? leaf.path : null;
}

const ID = "c1";

describe("source-document routes", () => {
  it("registers every route pattern exactly once", () => {
    const registered = featureRoutes.map((r) => r.path);
    expect(new Set(registered).size).toBe(registered.length);
    const missing = Object.entries(routePatterns)
      .filter(([name, pattern]) => name !== "home" && !registered.includes(pattern))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it("opens every child tab on a real page, with a label in en, ar and he", () => {
    for (const tab of CHILD_TABS) {
      expect(landsOn(childTabPath(tab, ID)), tab).not.toBeNull();
      for (const locale of ["en", "ar", "he"]) {
        expect(message(locale, "children", `child.tabs.${tab}`), `${locale} ${tab}`).toBeTruthy();
      }
    }
  });

  it("lands every cross-feature link of the source workflow on its page", () => {
    const links: [string, string][] = [
      [paths.childParentView(ID), routePatterns.childParentView],
      [paths.childParentAnswers(ID, 4, "meeting"), routePatterns.childParentAnswers],
      [paths.childParentAnswers(ID), routePatterns.childParentAnswers],
      [paths.childQuickBaseline(ID), routePatterns.childQuickBaseline],
      [paths.childTeacherObservation(ID, { cycle: "a1", domain: "social" }), routePatterns.childTeacherObservation],
      [paths.childPlan(ID), routePatterns.childPlan],
      [paths.childObservations(ID, { domain: "social", date_from: "2026-09-01" }), routePatterns.childObservations],
      [paths.childObservation(ID, "o1"), routePatterns.childObservation],
      [paths.childObserve(ID), routePatterns.childObserve],
      [paths.childDevelopment(ID), routePatterns.childDevelopment],
      [paths.childDevelopmentTimeline(ID, { type: ["review", "plan_changed"] }), routePatterns.childDevelopmentTimeline],
      [paths.childReports(ID, { type: "intervention_plan" }), routePatterns.childReports],
      [paths.newReview(ID), routePatterns.newReview],
      [paths.childContent(ID), routePatterns.childContent],
      [paths.parentOnboarding(ID), routePatterns.parentOnboarding],
      [paths.parentOnboardingStep(ID, 9), routePatterns.parentOnboardingStep],
      [paths.parentOnboardingStep(ID, 10), routePatterns.parentOnboardingStep],
    ];
    for (const [url, pattern] of links) expect(landsOn(url), url).toBe(pattern);
  });

  it("keeps the staff pages away from parents", () => {
    const staffOnly = [
      routePatterns.childParentView,
      routePatterns.childParentAnswers,
      routePatterns.childQuickBaseline,
      routePatterns.childTeacherObservation,
      routePatterns.childPlan,
      routePatterns.childObservations,
      routePatterns.childObservation,
      routePatterns.childDevelopmentTimeline,
      routePatterns.childReports,
    ];
    for (const pattern of staffOnly) {
      const route = featureRoutes.find((r) => r.path === pattern);
      expect(route?.roles, pattern).toBeTruthy();
      expect(route?.roles, pattern).not.toContain("parent");
    }
    const onboarding = featureRoutes.find((r) => r.path === routePatterns.parentOnboardingStep);
    expect(onboarding?.roles ?? ["parent"]).toContain("parent");
  });
});

describe("old addresses", () => {
  it("send the Current Focus page to the Plan tab, keeping the query", async () => {
    mockFetch({});
    const { router } = renderApp({ routes: featureRoutes, url: `${paths.childFocus(ID)}?goal=f1`, user: teacher });
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.childPlan(ID)));
    expect(router.state.location.search).toBe("?goal=f1");
  });

  it("send the old Timeline tab to Development › Timeline, keeping the filters", async () => {
    mockFetch({});
    const { router } = renderApp({ routes: featureRoutes, url: `${paths.childTimeline(ID)}?domain=social`, user: teacher });
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.childDevelopmentTimeline(ID)));
    expect(router.state.location.search).toContain("domain=social");
  });

  it("send a parent who opens a staff tab to the parent home", async () => {
    mockFetch({});
    const { router } = renderApp({ routes: featureRoutes, url: paths.childReports(ID), user: parent });
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.parentHome()));
  });
});

import { expect, test } from "@playwright/test";
import { login, openAdamAsTeacher } from "./helpers";

/**
 * E2E 1 — Teacher logs in → opens Adam → Quick Observation → creates a goal →
 * generates a story → approves → previews the child experience → records an outcome.
 */
test("teacher: observation → goal → generate → approve → preview → outcome", async ({ page }) => {
  await login(page, "teacher@kidsphere.local");
  await openAdamAsTeacher(page);

  // Quick observation
  await page.getByRole("link", { name: "Quick observation" }).first().click();
  await page.getByTestId("ctx-transition").click();
  await page.getByRole("button", { name: /Attention & executive function/ }).click();
  await page.getByTestId("obs-behavior").fill("With a 2-minute visual countdown he parked the truck and joined group time.");
  await page.getByRole("button", { name: /Visual countdown/ }).click();
  await page.getByTestId("outcome-helped").click();
  await page.getByTestId("save-observation").click();
  await expect(page.getByText("Observation saved")).toBeVisible();
  await expect(page).toHaveURL(/\/teacher\/children\/[^/]+$/);

  // New goal (Adam has 1 active goal from the seed)
  await page.getByRole("link", { name: "Goals" }).click();
  await page.getByTestId("new-goal").click();
  await page.getByTestId("goal-statement").fill("Tidy up blocks and join the circle after one picture cue.");
  await page.getByTestId("goal-indicator").fill("Joins the circle in 3 of 5 observed opportunities.");
  await page.getByTestId("create-goal").click();
  await expect(page.getByText("Goal created")).toBeVisible();
  await expect(page.getByTestId("goal-count")).toHaveText(/2 of 3/);

  // Generate a story for the new goal
  const goalCard = page.getByTestId("active-goal").filter({ hasText: "Tidy up blocks" });
  await goalCard.getByRole("link", { name: "Create content" }).click();
  await expect(page.getByTestId("personalization")).toBeVisible();
  await page.getByTestId("generate").click();
  await expect(page).toHaveURL(/\/teacher\/content\//);
  await expect(page.getByTestId("content-status")).toHaveText("Draft");
  await expect(page.getByTestId("rationale")).toBeVisible();

  // Approve
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("content-status")).toHaveText("Approved");

  // Preview child experience
  await page.getByRole("link", { name: "Preview child experience" }).click();
  await expect(page.getByTestId("preview-banner")).toBeVisible();
  await expect(page.getByTestId("story-player")).toBeVisible();
  await page.getByTestId("story-next").click();
  await expect(page.getByTestId("scene-text")).toBeVisible();
  await page.getByRole("link", { name: "Exit preview" }).click();

  // Record outcome
  await page.getByTestId("record-outcome").first().click();
  await page.getByTestId("result-HELPED").click();
  await page.getByTestId("save-outcome").click();
  await expect(page.getByText("Outcome recorded")).toBeVisible();
});

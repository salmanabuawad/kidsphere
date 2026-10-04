import { expect, test } from "@playwright/test";
import { login, openAdamAsTeacher } from "./helpers";

const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082",
  "hex",
);

async function teacherCharacterOptions(page: import("@playwright/test").Page) {
  await login(page, "teacher@kidsphere.local");
  await openAdamAsTeacher(page);
  await page.getByRole("link", { name: "Create content" }).first().click();
  await expect(page.getByTestId("personalization")).toBeVisible();
}

/**
 * E2E 2 — Parent completes the questionnaire → uploads a character image →
 * grants consent → later revokes it → the teacher can no longer select it.
 */
test("parent: questionnaire, character consent and revocation", async ({ page }) => {
  await login(page, "parent@kidsphere.local");

  // Questionnaire for Lina (not yet started in the seed)
  await page.getByTestId("start-questionnaire-Lina").click();
  await expect(page.getByTestId("section-child_info")).toBeVisible();
  await page.getByLabel("What does your child like to be called?").fill("Lulu");
  await page.getByTestId("q-next").click();
  await page.getByLabel("Describe your child in 3–5 words").fill("Joyful, curious, gentle");
  await page.getByRole("button", { name: /Kindness/ }).click();
  await page.getByTestId("q-next").click();
  await page.getByRole("button", { name: /Animals/ }).click();
  await page.getByRole("button", { name: /Music/ }).click();
  // Continue through the remaining sections, then submit from the review.
  for (let i = 0; i < 12; i++) await page.getByTestId("q-next").click();
  await expect(page.getByRole("heading", { name: "Review your answers" })).toBeVisible();
  await page.getByTestId("q-submit").click();
  await expect(page).toHaveURL(/\/parent\/children\/[^/]+$/);
  await expect(page.getByText(/What shines in Lina/)).toBeVisible();

  // Upload a character image for Adam and grant consent
  await page.goto("/parent");
  await page.getByTestId("parent-child-Adam").click();
  await page.getByRole("link", { name: /Family characters/ }).click();
  await page.getByTestId("media-relation").selectOption("MOTHER");
  await page.getByTestId("media-label").fill("Mama");
  await page.getByTestId("media-file").setInputFiles({ name: "mama.png", mimeType: "image/png", buffer: PNG_1X1 });
  await page.getByTestId("media-upload").click();
  await expect(page.getByTestId("media-item")).toHaveCount(1);
  await page.getByTestId("grant-consent").click();
  await page.getByTestId("consent-agree").check();
  await page.getByTestId("confirm-consent").click();
  await expect(page.getByTestId("revoke-consent")).toBeVisible();

  // Teacher can now select the image
  await teacherCharacterOptions(page);
  await expect(page.getByTestId("character-options")).toContainText("Mama");

  // Parent revokes
  await login(page, "parent@kidsphere.local");
  await page.getByTestId("parent-child-Adam").click();
  await page.getByRole("link", { name: /Family characters/ }).click();
  await page.getByTestId("revoke-consent").click();
  await expect(page.getByTestId("grant-consent")).toBeVisible();

  // Teacher can no longer select it
  await teacherCharacterOptions(page);
  await expect(page.getByTestId("no-characters")).toBeVisible();
});

import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Kidsphere-Dev-2026!";

/** Sign in through the real login form. UI language pinned to English for stable selectors. */
export async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "ks_locale", value: "en", url: "http://localhost:3100" }]);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function openAdamAsTeacher(page: Page) {
  await page.goto("/teacher/classes");
  await page.getByRole("link", { name: /Sunflowers/ }).click();
  await page.getByTestId("child-card-Adam").click();
  await expect(page.getByRole("heading", { name: "Adam", level: 1 })).toBeVisible();
}

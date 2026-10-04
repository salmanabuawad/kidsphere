import { expect, test } from "@playwright/test";
import { login, openAdamAsTeacher } from "./helpers";

/** E2E 3 — Publishing unapproved content is blocked (UI and API). */
test("teacher cannot publish unapproved content", async ({ page }) => {
  await login(page, "teacher@kidsphere.local");
  await openAdamAsTeacher(page);
  await page.getByRole("link", { name: "Content", exact: true }).click();
  // The seeded English story is a DRAFT.
  await page.getByRole("link", { name: /Adam and the Excavator's Last Two Scoops/ }).click();
  await expect(page.getByTestId("content-status")).toHaveText("Draft");

  await page.getByTestId("publish").click();
  await expect(page.getByText(/Approve the content before publishing/i)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("content-status")).toHaveText("Draft");

  // Direct API call is blocked too.
  const id = page.url().split("/").pop()!;
  const res = await page.request.post(`/api/content/${id}/publish`, { data: {}, headers: { Origin: "http://localhost:3100" } });
  expect(res.status()).toBe(422);
  expect((await res.json()).error.code).toBe("INVALID_TRANSITION");

  // And the child player never sees it.
  const childRes = await page.request.get(`/api/play/content/${id}`);
  expect(childRes.status()).toBe(401);
});

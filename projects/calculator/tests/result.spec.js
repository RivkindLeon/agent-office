import { expect, test } from "@playwright/test";

test("shows the result after a successful calculation", async ({ page }) => {
  await page.goto("/");
  await page.locator("#left").fill("2");
  await page.locator("#operation").selectOption("add");
  await page.locator("#right").fill("3");
  await page.locator("#calculate").click();

  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#result")).toHaveText("5");
});

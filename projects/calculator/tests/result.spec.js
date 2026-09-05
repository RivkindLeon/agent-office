import { expect, test } from "@playwright/test";

test("shows the result after a successful calculation", async ({ page }) => {
  await page.goto("/");
  const examples = [
    { left: "2", operation: "add", right: "3", expected: "5" },
    { left: "7", operation: "subtract", right: "4", expected: "3" },
    { left: "3", operation: "multiply", right: "4", expected: "12" },
    { left: "12", operation: "divide", right: "4", expected: "3" },
  ];

  for (const { left, operation, right, expected } of examples) {
    await page.locator("#left").fill(left);
    await page.locator("#operation").selectOption(operation);
    await page.locator("#right").fill(right);
    await page.locator("#calculate").click();

    await expect(page.locator("#result")).toBeVisible();
    await expect(page.locator("#result")).toHaveText(expected);
  }
});

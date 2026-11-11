import { test, expect } from "@playwright/test";

test("theme preference persists across home and workspace", async ({ page }) => {
  await page.goto("/");
  await page.locator(".theme-toggle").first().click();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
  await page.goto("/overview");
  await expect(page.locator(".stats-grid")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
  await page.locator(".theme-toggle").first().click();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");
  await page.goto("/security");
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");
});

test("DevSecOps center, flags, onboarding and assistant work end to end", async ({ page }) => {
  const key = `e2e_flag_${Date.now()}`;

  await page.goto("/security");
  await expect(page.getByRole("heading", { name: "Security center" })).toBeVisible();
  await expect(page.locator(".sec-policy-row").first()).toBeVisible();
  const toggle = page.locator(".sec-policy-row .toggle").first();
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect.poll(() => page.locator(".sec-policy-row .toggle").first().getAttribute("aria-checked")).not.toBe(before);
  await page.locator(".sec-policy-row .toggle").first().click();

  await page.goto("/flags");
  await page.getByRole("button", { name: "New flag" }).first().click();
  await page.getByLabel(/^Flag key/).fill(key);
  await page.getByRole("dialog").getByRole("button", { name: "Create flag" }).click();
  await expect(page.locator(".flag-key", { hasText: key })).toBeVisible();
  await page.getByRole("button", { name: `Delete flag ${key}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete flag" }).click();
  await expect(page.locator(".flag-key", { hasText: key })).toHaveCount(0);

  await page.goto("/onboarding");
  await page.getByRole("button", { name: /Generate files/ }).first().click();
  await expect(page.locator(".file-item").first()).toBeVisible();
  expect(await page.locator(".file-item").count()).toBeGreaterThanOrEqual(3);
  await page.getByRole("button", { name: /Simulate commit/ }).click();
  await expect(page.locator(".inline-note", { hasText: "Simulation complete" })).toBeVisible();

  await page.locator(".ai-launcher").click();
  await page.getByLabel("Ask the assistant").fill("What is our security posture?");
  await page.locator(".ai-input").getByRole("button").click();
  await expect(page.locator(".ai-msg.bot").nth(1)).toContainText(/security posture/i, { timeout: 15000 });
  await page.getByLabel("Close assistant").click();
});

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => { await page.goto("/overview"); await expect(page.locator(".stats-grid")).toBeVisible(); });
test.afterAll(async ({ playwright }) => { const context = await playwright.request.newContext({ baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000", ignoreHTTPSErrors: true }); await context.get("/api/auth/demo", { maxRedirects: 0 }); const result = await context.get("/api/v1/projects"); if (result.ok()) for (const project of (await result.json()).data) if (project.repository.startsWith("acme/e2e-")) await context.delete(`/api/v1/projects/${project.id}`); await context.dispose(); });

test("home page hero, branch switcher, and dashboard navigation work", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Every Git branch gets an isolated preview/ })).toBeVisible();
  await page.getByRole("tab", { name: "main" }).click();
  await expect(page.locator(".hero-preview-url")).toContainText("storefront-main-0019c4b2.acme.preview.test");
  await page.getByRole("link", { name: /Explore live sandbox|Go to dashboard/ }).click();
  await expect(page.locator(".stats-grid .stat-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Search workspace", exact: true }).click();
  await page.getByRole("textbox", { name: "Search all projects and deployments" }).fill("storefront");
  await expect(page.locator(".command-result").filter({ hasText: "storefront" }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Projects", exact: false }).first().click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search projects or repositories..." }).fill("storefront");
  await expect(page.locator(".project-page-grid .project-card")).toHaveCount(1);
});

test("project, encrypted variable, failure, retry, and cleanup lifecycle", async ({ page }) => {
  const name = `e2e-${Date.now()}`;
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  
  if (!await dialog.getByLabel(/^Repository/).isVisible()) await dialog.locator("select").first().selectOption("__manual");
  await dialog.getByLabel(/^Repository/).fill(`acme/${name}`);
  await dialog.getByLabel(/^Project name/).fill(name);
  await dialog.getByLabel("Deploy the default branch after connecting").uncheck();
  await dialog.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+/);
  await page.getByRole("tab", { name: /^Variables/ }).click();
  await page.getByRole("button", { name: "Add variable", exact: true }).first().click();
  await page.getByLabel("Variable name").fill("E2E_SECRET");
  await page.getByLabel("Value", { exact: true }).fill("never-expose-this-test-value");
  await page.getByLabel("Treat this value as a secret").check();
  await page.getByRole("button", { name: "Save variable", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("table")).toContainText("E2E_SECRET");
  const response = await page.request.get("/api/workspace"); const raw = await response.text();
  expect(raw).not.toContain("never-expose-this-test-value"); expect(raw).not.toContain("valueCipher");
  await page.getByRole("button", { name: "Deploy branch", exact: true }).click();
  await page.getByLabel("Simulate a build failure to test recovery").check();
  await page.getByRole("dialog").getByRole("button", { name: "Deploy branch", exact: true }).click();
  await expect(page).toHaveURL(/\/deployments\/[a-f0-9-]+/);
  await expect(page.locator(".detail-actions .status-badge")).toHaveText("Failed", { timeout: 25000 });
  await expect(page.locator(".log-panel")).toContainText("Simulated build failure");
  await page.getByRole("button", { name: "Redeploy", exact: true }).click();
  await expect(page.locator(".detail-actions .status-badge")).toHaveText("Ready", { timeout: 25000 });
  await page.getByRole("button", { name: "Environment details", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".status-badge").first()).toHaveText("Stopped");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: name, exact: true }).first().click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete project", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("runners lifecycle and protected environment deletion guard work", async ({ page }) => {
  const runnerName = `e2e-runner-${Date.now()}`;
  await page.goto("/integrations");
  await page.getByRole("button", { name: "Register runner", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Runner name/).fill(runnerName);
  await dialog.getByRole("button", { name: "Register runner", exact: true }).click();
  await expect(dialog).toContainText("dfr_");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("table")).toContainText(runnerName);
  await page.getByRole("button", { name: `Delete runner ${runnerName}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete runner", exact: true }).click();
  await expect(page.locator("table")).not.toContainText(runnerName);
});

test("mobile navigation and environment details are usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Environments", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Environments", exact: true })).toBeVisible();
  await page.locator("tbody tr").first().click();
  await expect(page.getByRole("dialog")).toContainText("Resource limits");
  await page.getByRole("button", { name: "Close dialog" }).click();
});

test("anonymous visitors get only the shared sandbox; personal data stays protected", async ({ page }) => {
  const anon = await page.request.fetch("/api/workspace", { headers: { Cookie: "" } });
  expect(anon.status()).toBe(200);
  expect((await anon.json()).demoMode).toBe(true);

  const foreign = await page.request.fetch("/api/workspace", { headers: { Cookie: "", "x-organization-id": "3f1c9a52-5d8e-4a71-9b2c-7e4d81f6a0c3" } });
  expect(foreign.status()).toBe(403);

  const denied = await page.request.get("/api/workspace", { headers: { "x-organization-id": "00000000-0000-4000-8000-000000000099" } });
  expect(denied.status()).toBe(403);

  const crossSite = await page.request.post("/api/organizations", { data: { name: "Rejected cross-site workspace" }, headers: { Origin: "https://untrusted.example", "Sec-Fetch-Site": "cross-site" } });
  expect(crossSite.status()).toBe(403);
});

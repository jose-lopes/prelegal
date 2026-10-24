import { expect, test } from "@playwright/test";

test("demo login supports keyboard access without creating browser storage", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to Prelegal" })).toBeVisible();
  await expect(page.getByText("Demo access · No account or password needed.")).toBeVisible();
  await page.screenshot({ path: "test-results/desktop-login.png", fullPage: true });
  await expect(page.getByLabel("Company / legal name", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Company / legal name", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(await page.context().cookies()).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("demo login fits a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-login.png", fullPage: true });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agreement details" })).toBeVisible();
});

test("Go serves API health and missing routes alongside the exported frontend", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  expect((await request.get("/api/missing")).status()).toBe(404);
  expect((await request.get("/missing.js")).status()).toBe(404);
});

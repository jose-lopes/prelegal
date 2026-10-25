import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const password = "a long test password";

test("registers with the keyboard, survives reload, signs out and returns with sign in", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const email = `account-${randomUUID()}@example.com`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.screenshot({ path: "test-results/desktop-login.png", fullPage: true });
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Email address").fill(email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.type(password);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "My documents", exact: true })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByText("These documents are drafts and are subject to legal review.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  const cookies = await page.context().cookies();
  expect(cookies).toHaveLength(1);
  expect(cookies[0].httpOnly).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "My documents", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(await page.context().cookies()).toHaveLength(0);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong password here");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("region", { name: "Welcome back" }).getByRole("alert")).toContainText("Email or password is incorrect");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My documents", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("sign in, registration, and empty library fit mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-login.png", fullPage: true });
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Email address").fill(`mobile-${randomUUID()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My documents", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-library.png", fullPage: true });
  await page.getByRole("button", { name: "Create your first agreement" }).click();
  await expect(page.getByRole("heading", { name: "Draft with AI" })).toBeVisible();
});

test("duplicate registration provides a way back to sign in", async ({ page }) => {
  const email = `existing-${randomUUID()}@example.com`;
  expect((await page.request.post("/api/auth/signup", { data: { email, password } })).ok()).toBe(true);
  await page.request.post("/api/auth/signout");
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("region", { name: "Create your account" }).getByRole("alert")).toContainText("already exists");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("Go serves API health and missing routes alongside the exported frontend", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  expect((await request.get("/api/missing")).status()).toBe(404);
  expect((await request.get("/missing.js")).status()).toBe(404);
  expect((await request.post("/api/chat", { data: {} })).status()).toBe(401);
});

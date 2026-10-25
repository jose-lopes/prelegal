import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { complete, completed, enter, replyWith, say } from "./chat-fixtures";

test("validates, updates the preview, and downloads the complete selectable-text PDF", async ({ page }) => {
  const pageErrors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => requests.push(request.url()));
  await enter(page);
  const downloadButton = page.locator(".primary-button");
  await expect(downloadButton).toBeDisabled();
  await expect(page.getByRole("log")).toContainText("You selected Mutual Non-Disclosure Agreement");
  await complete(page);
  const preview = page.getByRole("article", { name: "Completed agreement preview" });
  await expect(preview).toContainText("Acme & José, Inc.");
  await expect(preview).toContainText("October 24, 2026");
  await expect(downloadButton).toBeEnabled();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "test-results/desktop-nda.png", fullPage: false });
  const literal = '<script>window.injected=true</script> A & B <Co>.';
  await replyWith(page, { ...completed(), modifications: literal });
  await say(page, `Set modifications to: ${literal}`);
  await expect(preview).toContainText(literal);
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("mutual-nda-2026-10-24.pdf");
  const location = await download.path();
  const buffer = await readFile(location!);
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/` });
  const pdf = await loadingTask.promise;
  expect(pdf.numPages).toBeGreaterThanOrEqual(3);
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const text = await (await pdf.getPage(n)).getTextContent();
    const content = text.items.map(item => "str" in item ? item.str : "").join(" ");
    expect(content.trim()).not.toBe("");
    pages.push(content);
  }
  const text = pages.join(" ").replace(/\s+/g, " ");
  for (const required of ["José Silva", "Zoë North", "Acme & José, Inc.", "October 24, 2026", "New Castle County, Delaware", "jose@example.com", "123 Main St", "trade secrets", "11. General", "CC BY 4.0", "Standard Terms unchanged", "Signature", "Date", literal]) {
    expect(text).toContain(required);
  }
  expect(pageErrors).toEqual([]);
  const origin = new URL(page.url()).origin;
  expect(requests.every(url => new URL(url).origin === origin)).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await loadingTask.destroy();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome to Prelegal" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("log")).not.toContainText("Acme");
  await expect(page.locator(".primary-button")).toBeDisabled();
});

test("handles long input, indefinite options and the mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await complete(page);
  await replyWith(page, { ...completed(), party1: { ...completed().party1, company: "Société très longue de recherche et de développement ".repeat(8) }, termMode: "indefinite", termYears: "", confidentialityMode: "perpetual", confidentialityYears: "" });
  await say(page, "Use the long legal name, continue until terminated and protect confidentiality in perpetuity.");
  const preview = page.getByRole("article", { name: "Completed agreement preview" });
  await expect(preview).toContainText("Continues until terminated");
  await expect(preview).toContainText("In perpetuity.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".primary-button").click();
  expect(await (await downloadPromise).failure()).toBeNull();
  await page.screenshot({ path: "test-results/mobile-nda.png", fullPage: true });
});

test("allows keyboard navigation and a failed download can be retried", async ({ page }) => {
  await enter(page);
  await page.getByLabel("Your message", { exact: true }).focus();
  await page.getByLabel("Your message", { exact: true }).fill("Hello");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send message" })).toBeFocused();
  await complete(page);
  await page.route("**/fonts/*.ttf", route => route.abort());
  await page.locator(".primary-button").click();
  await expect(page.locator(".download-status")).toContainText("could not be created", { timeout: 30_000 });
  await expect(page.getByRole("article")).toContainText("Acme & José, Inc.");
  await page.unroute("**/fonts/*.ttf");
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Retry download" }).click();
  expect(await (await downloadPromise).failure()).toBeNull();
});

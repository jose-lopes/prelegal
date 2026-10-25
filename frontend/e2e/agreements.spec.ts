import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { initialDraft, type Draft } from "../src/lib/agreement";
import { loadTemplates } from "../src/lib/template";
import { complete, enter, say } from "./chat-fixtures";

const templates = loadTemplates();
function fixture(id: string) {
  const definition = templates.find(item => item.id === id)!;
  const fields = initialDraft(definition);
  for (const field of definition.fields) fields[field.id] = field.choices?.[0] || (field.type === "date" ? "2026-10-24" : field.type === "years" ? "2" : field.type === "percent" ? "99.9%" : field.type === "us-state" ? "Delaware" : `${field.label}: José & Zoë <Research>`);
  return fields;
}
async function respond(page: Page, documentId: string, draft: Draft, suggestedDocumentId = "", reply = "Review the document preview.") {
  await page.route("**/api/chat", route => route.fulfill({ json: { reply, documentId, suggestedDocumentId, fields: Object.entries(draft).map(([id, value]) => ({ id, value })) } }));
}

test("starts unselected and supports selection and partial extraction through chat", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Document type", { exact: true })).toHaveValue("");
  await expect(page.getByText("Start with your agreement")).toBeVisible();
  await expect(page.locator(".primary-button")).toBeDisabled();
  const fields = initialDraft(templates.find(item => item.id === "pilot-agreement")!);
  fields["party1.company"] = "Acme Pilot";
  await respond(page, "pilot-agreement", fields, "", "Who is the customer for this pilot?");
  await say(page, "I need a pilot agreement for Acme Pilot.");
  await expect(page.getByLabel("Document type", { exact: true })).toHaveValue("pilot-agreement");
  await expect(page.getByRole("article")).toContainText("Acme Pilot");
  await expect(page.getByRole("log")).toContainText("Who is the customer");
  await expect(page.locator(".primary-button")).toBeDisabled();
});

test("restores separate drafts and waits for acceptance of an unsupported-request alternative", async ({ page }) => {
  await enter(page);
  await complete(page);
  const selector = page.getByLabel("Document type", { exact: true });
  await selector.selectOption("pilot-agreement");
  await expect(page.getByRole("article")).not.toContainText("Acme & José, Inc.");
  const pilot = fixture("pilot-agreement");
  await respond(page, "pilot-agreement", pilot);
  await say(page, "These are my pilot details.");
  await selector.selectOption("mutual-nda");
  await expect(page.getByRole("article")).toContainText("Acme & José, Inc.");
  await expect(page.locator(".primary-button")).toBeEnabled();
  await selector.selectOption("pilot-agreement");
  await expect(page.getByRole("article")).toContainText(pilot["party1.company"]);
  await respond(page, "pilot-agreement", pilot, "professional-services-agreement", "We cannot generate employment contracts. A Professional Services Agreement covers independent services rather than employment. Would that help?");
  await say(page, "Can you make an employment contract?");
  await expect(selector).toHaveValue("pilot-agreement");
  await expect(page.getByRole("article")).toContainText(pilot["party1.company"]);
  await expect(page.getByRole("log")).toContainText("cannot generate employment contracts");
  const target = initialDraft(templates.find(item => item.id === "professional-services-agreement")!);
  await respond(page, "professional-services-agreement", target, "", "Who will provide the services?");
  await page.getByRole("button", { name: "Use Professional Services Agreement", exact: true }).click();
  await expect(selector).toHaveValue("professional-services-agreement");
  await expect(page.locator(".primary-button")).toBeDisabled();
  await expect(page.getByRole("article")).not.toContainText(pilot["party1.company"]);
  await selector.selectOption("pilot-agreement");
  await expect(page.getByRole("article")).toContainText(pilot["party1.company"]);
});

for (const definition of templates) {
  test(`previews and downloads every term: ${definition.id}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await enter(page);
    await page.getByLabel("Document type", { exact: true }).selectOption(definition.id);
    const fields = fixture(definition.id);
    await respond(page, definition.id, fields);
    await say(page, `Use the supplied ${definition.name} details.`);
    await expect(page.getByRole("article")).toContainText(definition.name);
    await expect(page.locator(".primary-button")).toBeEnabled();
    const downloading = page.waitForEvent("download");
    await page.locator(".primary-button").click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`${definition.id}-2026-10-24.pdf`);
    const data = new Uint8Array(await readFile((await download.path())!));
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data, useSystemFonts: false, standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/` });
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      const footer = content.items.find(item => "str" in item && item.str === `${definition.name} · ${n} / ${pdf.numPages}`);
      expect(footer, "Each page has a visible page-number footer").toBeTruthy();
      if (footer && "transform" in footer) {
        expect(footer.transform[5]).toBeGreaterThan(0);
        expect(footer.transform[5]).toBeLessThan(60);
      }
      pages.push(content.items.map(item => "str" in item ? item.str : "").join(" ").replace(`${definition.name} · ${n} / ${pdf.numPages}`, ""));
    }
    const text = pages.join(" ").replace(/\p{Cf}/gu, "").replace(/\s+/g, " ");
    expect(text).toContain(definition.name);
    expect(text).toContain(fields["party1.company"]);
    expect(text).toContain("CC BY 4.0");
    expect(text).toContain("Signature");
    for (const clause of definition.template.clauses) {
      // All clauses and definitions, including the final one, must survive PDF pagination.
      expect(text).toContain(clause.heading);
      if (clause.text) expect(text).toContain(clause.text.replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim());
    }
    expect(errors).toEqual([]);
    await task.destroy();
  });
}

test("all document selections fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  for (const definition of templates) {
    await page.getByLabel("Document type", { exact: true }).selectOption(definition.id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), definition.id).toBe(true);
    await expect(page.getByRole("article")).toContainText(definition.name);
  }
});

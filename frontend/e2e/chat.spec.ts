import { flattenNda } from "../src/lib/agreement";
import { expect, test } from "@playwright/test";
import { initialChatForm } from "../src/lib/chat";
import { complete, completed, enter, replyWith, say } from "./chat-fixtures";

test("asks follow-up questions, fills partial details, and applies corrections with context", async ({ page }) => {
  await enter(page);
  const partial = { ...initialChatForm(), party1: { ...initialChatForm().party1, company: "Acme" }, purpose: "Discuss a research partnership." };
  await replyWith(page, partial, "Who is the other party, and who will sign for Acme?");
  await say(page, "We are Acme, discussing a research partnership.");
  await expect(page.getByRole("log")).toContainText("Who is the other party");
  await expect(page.getByRole("article")).toContainText("Acme");
  await expect(page.locator(".primary-button")).toBeDisabled();
  await complete(page);
  await replyWith(page, { ...completed(), party2: { ...completed().party2, company: "North Research, LLC" } }, "I’ve corrected the second party’s legal name.");
  const requestPromise = page.waitForRequest("**/api/chat");
  await say(page, "Actually, the second party’s legal name is North Research, LLC.");
  const payload = (await requestPromise).postDataJSON();
  expect(payload.messages).toHaveLength(7);
  expect(payload.messages.at(-1).content).toContain("North Research");
  expect(payload.drafts["mutual-nda"]["party2.company"]).toBe("Studio North");
  await expect(page.getByRole("article")).toContainText("North Research, LLC");
  await expect(page.getByRole("article")).toContainText("José Silva");
  await expect(page.locator(".primary-button")).toBeEnabled();
});

test("a service failure keeps the message and draft and retries without duplicate turns", async ({ page }) => {
  await enter(page);
  await complete(page);
  await page.route("**/api/chat", route => route.fulfill({ status: 502, json: { error: "The AI service is unavailable. Please retry." } }));
  await page.getByLabel("Your message").fill("Change the court location to Wilmington, Delaware.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("region", { name: "Draft with AI" }).getByRole("alert")).toContainText("unavailable");
  await expect(page.getByLabel("Your message")).toHaveValue("Change the court location to Wilmington, Delaware.");
  await expect(page.getByRole("article")).toContainText("New Castle County, Delaware");
  await replyWith(page, { ...completed(), jurisdiction: "Wilmington, Delaware" }, "Court location updated.");
  const requestPromise = page.waitForRequest("**/api/chat");
  await page.getByRole("button", { name: "Retry message" }).click();
  await expect(page.getByRole("article")).toContainText("Wilmington, Delaware");
  expect((await requestPromise).postDataJSON().messages).toHaveLength(5);
  await expect(page.getByRole("log").getByText("Change the court location to Wilmington, Delaware.", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Draft with AI" }).getByRole("alert")).toHaveCount(0);
});

test("prevents duplicate sends and downloads while an update is pending", async ({ page }) => {
  await enter(page);
  await complete(page);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route("**/api/chat", async route => {
    calls++;
    await waiting;
    await route.fulfill({ json: { reply: "Updated.", documentId: "mutual-nda", suggestedDocumentId: "", fields: Object.entries(flattenNda({ ...completed(), termYears: "5" })).map(([id,value]) => ({ id,value })) } });
  });
  await page.getByLabel("Your message").fill("Change the agreement to five years.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(page.locator(".primary-button")).toBeDisabled();
  await expect(page.getByLabel("Your message")).toBeDisabled();
  release();
  await expect(page.getByRole("article")).toContainText("Expires 5 years");
  await expect(page.locator(".primary-button")).toBeEnabled();
  expect(calls).toBe(1);
});

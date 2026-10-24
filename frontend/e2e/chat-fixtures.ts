import { expect, type Page } from "@playwright/test";
import { initialChatForm } from "../src/lib/chat";
import type { NdaForm } from "../src/lib/nda";

export function completed(): NdaForm {
  return { ...initialChatForm(), party1: { company: "Acme & José, Inc.", name: "José Silva", title: "CEO", address: "jose@example.com" }, party2: { company: "Studio North", name: "Zoë North", title: "Director", address: "123 Main St\nNew Castle, DE" }, purpose: "Evaluating a research partnership.", effectiveDate: "2026-10-24", termYears: "2", confidentialityYears: "3", governingLaw: "Delaware", jurisdiction: "New Castle County, Delaware" };
}

export async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

export async function replyWith(page: Page, form: NdaForm, reply = "Your NDA is ready to review.") {
  await page.route("**/api/chat", route => route.fulfill({ json: { reply, form } }));
}

export async function say(page: Page, text: string) {
  await page.getByLabel("Your message", { exact: true }).fill(text);
  await page.getByRole("button", { name: /^(Send message|Retry message)$/ }).click();
  await expect(page.getByLabel("Your message", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Your message", { exact: true })).toBeFocused();
}

export async function complete(page: Page) {
  await replyWith(page, completed());
  await say(page, "Acme & José, Inc. and Studio North are evaluating a research partnership. José Silva (CEO), jose@example.com; Zoë North (Director), 123 Main St, New Castle, DE. Effective October 24, 2026, two-year agreement, three years confidentiality, Delaware law, New Castle County courts. No modifications.");
}

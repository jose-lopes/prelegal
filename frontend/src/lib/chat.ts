import { initialForm, validate, type Field, type NdaForm } from "./nda";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatResponse = { reply: string; form: NdaForm };

export const WELCOME = "Let’s create a mutual NDA. Tell me who will be sharing confidential information and what you’re planning together. You can give me several details at once, and I’ll ask about anything missing.";

export function initialChatForm(): NdaForm {
  // Terms and dates must come from the conversation, rather than implicit defaults.
  return { ...initialForm(), purpose: "", termYears: "", confidentialityYears: "" };
}

const labels: Record<Field, string> = {
  "party1.company": "Party 1 legal name", "party1.name": "Party 1 signatory", "party1.title": "Party 1 title", "party1.address": "Party 1 notice address",
  "party2.company": "Party 2 legal name", "party2.name": "Party 2 signatory", "party2.title": "Party 2 title", "party2.address": "Party 2 notice address",
  purpose: "Purpose", effectiveDate: "Effective date", termMode: "Agreement duration", termYears: "Agreement years",
  confidentialityMode: "Confidentiality duration", confidentialityYears: "Confidentiality years", governingLaw: "Governing US state", jurisdiction: "Court location", modifications: "Modifications",
};

export function requiredDetails(form: NdaForm) {
  return (Object.keys(validate(form)) as Field[]).map(field => labels[field]);
}

export async function sendChat(messages: ChatMessage[], form: NdaForm, signal: AbortSignal): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, form }), signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to send your message. Please retry.");
  return result;
}

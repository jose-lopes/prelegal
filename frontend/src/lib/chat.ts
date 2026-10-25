import { initialForm, type NdaForm } from "./nda";
import type { Drafts } from "./agreement";
import { api } from "./api";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatResponse = { reply: string; documentId: string; suggestedDocumentId: string; fields: { id: string; value: string }[] };
export const WELCOME = "What would you like to put in writing? Describe your agreement or choose a document below. I’ll help you complete its details.";

// Retained for the NDA-specific assembly and regression fixtures.
export function initialChatForm(): NdaForm {
  return { ...initialForm(), purpose: "", termYears: "", confidentialityYears: "" };
}

export async function sendChat(messages: ChatMessage[], documentId: string, drafts: Drafts, signal: AbortSignal): Promise<ChatResponse> {
  return api<ChatResponse>("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, documentId, drafts }), signal,
  });
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { sendChat } from "../src/lib/chat";
import { initialDraft, validateAgreement } from "../src/lib/agreement";
import { loadTemplates } from "../src/lib/template";

afterEach(() => vi.unstubAllGlobals());
const definition = loadTemplates().find(item => item.id === "mutual-nda")!;

describe("AI drafting", () => {
  it("requires explicit terms and dates before download", () => {
    const draft = initialDraft(definition);
    expect(draft.purpose).toBe("");
    expect(draft.effectiveDate).toBe("");
    expect(validateAgreement(definition, draft)).toHaveProperty("termYears");
    expect(validateAgreement(definition, draft)).toHaveProperty("confidentialityYears");
  });
  it("sends conversation and session drafts only to the local API", async () => {
    const drafts = { "mutual-nda": initialDraft(definition) };
    const messages = [{ role: "user" as const, content: "Our company is Acme." }];
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ reply: "Who is the other party?", documentId: "mutual-nda", suggestedDocumentId: "", fields: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect((await sendChat(messages, "mutual-nda", drafts, signal)).reply).toBe("Who is the other party?");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/chat");
    expect(options.signal).toBe(signal);
    expect(JSON.parse(options.body)).toEqual({ messages, documentId: "mutual-nda", drafts });
  });
  it("surfaces API errors so a failed message can be retried", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "The AI service is unavailable. Please retry." }, { status: 502 })));
    await expect(sendChat([], "", {}, new AbortController().signal)).rejects.toThrow("The AI service is unavailable");
  });
});

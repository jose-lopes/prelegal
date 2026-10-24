import { afterEach, describe, expect, it, vi } from "vitest";
import { initialChatForm, requiredDetails, sendChat } from "../src/lib/chat";

afterEach(() => vi.unstubAllGlobals());

describe("AI drafting", () => {
  it("requires explicit terms and dates before download", () => {
    const form = initialChatForm();
    expect(form.purpose).toBe("");
    expect(form.effectiveDate).toBe("");
    expect(requiredDetails(form)).toContain("Agreement years");
    expect(requiredDetails(form)).toContain("Confidentiality years");
  });

  it("sends conversation and the current draft only to the local API", async () => {
    const form = initialChatForm();
    const messages = [{ role: "user" as const, content: "Our company is Acme." }];
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ reply: "Who is the other party?", form }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect((await sendChat(messages, form, signal)).reply).toBe("Who is the other party?");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/chat");
    expect(options.signal).toBe(signal);
    expect(JSON.parse(options.body)).toEqual({ messages, form });
  });

  it("surfaces API errors so a failed message can be retried", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "The AI service is unavailable. Please retry." }, { status: 502 })));
    await expect(sendChat([], initialChatForm(), new AbortController().signal)).rejects.toThrow("The AI service is unavailable");
  });
});

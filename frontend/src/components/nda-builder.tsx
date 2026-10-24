"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { assembleDocument, type Template } from "@/lib/nda";
import { initialChatForm, requiredDetails, sendChat, WELCOME, type ChatMessage } from "@/lib/chat";
import { DocumentPreview } from "./document-preview";

export function NdaBuilder({ template }: { template: Template }) {
  const [form, setForm] = useState(initialChatForm);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: WELCOME }]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState("");
  const [chatError, setChatError] = useState("");
  const [pdfStatus, setPdfStatus] = useState<"idle" | "loading" | "error">("idle");
  const busy = useRef(false);
  const downloading = useRef(false);
  const request = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const missing = requiredDetails(form);
  const complete = missing.length === 0;
  const document = assembleDocument(form, template);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, pending]);
  useEffect(() => {
    // Wait until React has re-enabled the composer before restoring keyboard focus.
    if (!pending && request.current) composer.current?.focus();
  }, [pending]);

  async function send() {
    if (busy.current || !text.trim()) return;
    busy.current = true;
    const content = text.trim();
    const conversation: ChatMessage[] = [...messages, { role: "user", content }];
    setPending(content);
    setChatError("");
    request.current = new AbortController();
    try {
      const result = await sendChat(conversation, form, request.current.signal);
      setForm(result.form);
      setMessages([...conversation, { role: "assistant", content: result.reply }]);
      setText("");
      setPdfStatus("idle");
    } catch (error) {
      if (!request.current.signal.aborted) {
        setChatError(error instanceof Error ? error.message : "Unable to send your message. Please retry.");
      }
    } finally {
      setPending("");
      busy.current = false;
    }
  }

  async function download() {
    if (!complete || busy.current || downloading.current) return;
    downloading.current = true;
    setPdfStatus("loading");
    try {
      const { downloadPdf } = await import("@/lib/pdf");
      await downloadPdf(document, form.effectiveDate);
      setPdfStatus("idle");
    } catch {
      setPdfStatus("error");
    } finally {
      downloading.current = false;
    }
  }

  return <div className="chat-builder">
    <header className="site-header"><Link className="brand" href="/" aria-label="Prelegal home"><span className="brand-symbol" aria-hidden="true">p.</span>prelegal<span className="prototype-tag">PROTOTYPE</span></Link><span className="privacy-note">AI-assisted Mutual NDA</span></header>
    <main>
      <div className="intro"><div><p className="eyebrow">A CLEAR START TO YOUR NEXT CONVERSATION</p><h1>Talk it through.<br />Put it in writing.</h1><p className="intro-copy">Tell us about your agreement. Your AI assistant will ask for what’s missing<br className="desktop-break" /> and fill the mutual NDA as you chat.</p></div><div className="template-badge"><span className="badge-icon" aria-hidden="true">↗</span><div>Built on Common Paper<small>Mutual NDA · Version 1.0</small></div></div></div>
      <div className="workspace">
        <section className="chat-panel" aria-labelledby="chat-heading">
          <div className="panel-heading"><h2 id="chat-heading">Draft with AI</h2><span>Mutual NDA</span></div>
          <p className="chat-privacy">Your messages and agreement details are sent to our AI service to draft your NDA. Prelegal does not save them; reloading clears this session.</p>
          <div className="chat-transcript" role="log" aria-label="NDA conversation" aria-live="polite" ref={transcript}>
            {messages.map((message, index) => <div className={`chat-message ${message.role}`} key={index}><strong>{message.role === "user" ? "You" : "Prelegal assistant"}</strong><p>{message.content}</p></div>)}
            {pending && <div className="chat-message user"><strong>You</strong><p>{pending}</p></div>}
          </div>
          <p className="chat-progress" role="status">{pending ? "Updating your NDA…" : complete ? "Your draft is ready to review. You can still ask for changes." : "Share details in any order. Ask for changes at any time."}</p>
          {chatError && <p className="chat-error" role="alert">{chatError} Your draft and message are still here.</p>}
          <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
            <label htmlFor="chat-message">Your message</label>
            <textarea id="chat-message" ref={composer} value={text} onChange={event => setText(event.target.value)} maxLength={8000} rows={3} placeholder="e.g. We’re Acme and we’re discussing a partnership with Studio North…" disabled={!!pending} required />
            <button className="chat-send" type="submit" disabled={!!pending || !text.trim() || pdfStatus === "loading"}>{pending ? "Sending…" : chatError ? "Retry message" : "Send message"}<span aria-hidden="true">↗</span></button>
          </form>
          {missing.length > 0 && <details className="chat-missing"><summary>Still needed for your NDA ({missing.length})</summary><ul>{missing.map(label => <li key={label}>{label}</li>)}</ul></details>}
        </section>
        <section className="preview-panel" aria-labelledby="preview-heading"><div className="preview-toolbar"><div><span className="status-dot" aria-hidden="true" /><h2 id="preview-heading">Document preview</h2></div><span className={complete ? "status-pill ready" : "status-pill"}>{complete ? "Ready to download" : "Draft · Chat to complete"}</span></div>
          <div className="preview-scroll"><DocumentPreview document={document} /></div>
          <div className="download-bar"><div><strong>Your mutual NDA</strong><span>Complete cover page + standard terms</span></div><button type="button" className="primary-button" onClick={() => void download()} disabled={!complete || !!pending || pdfStatus === "loading"}><span aria-hidden="true">↓</span>{pdfStatus === "loading" ? "Preparing PDF…" : pdfStatus === "error" ? "Retry download" : "Download PDF"}</button></div>
          <div className="download-status" role="status">{pdfStatus === "error" ? "The PDF could not be created. Your details are still here. Please retry." : pdfStatus === "loading" ? "Creating your PDF in this browser…" : !complete ? "The assistant will help you complete the required details." : "Review your draft before downloading. Signatures and signing dates are left blank."}</div>
        </section>
      </div>
      <footer className="site-footer"><span>prelegal <span className="footer-divider">/</span> Less paperwork. More possibility.</span><span>Based on <a href="https://commonpaper.com/standards/mutual-nda/1.0/">Common Paper</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></span></footer>
    </main>
  </div>;
}

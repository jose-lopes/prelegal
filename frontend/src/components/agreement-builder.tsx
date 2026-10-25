"use client";

import { useEffect, useRef, useState } from "react";
import { assembleAgreement, initialDraft, validateAgreement, type AgreementTemplate, type Drafts } from "@/lib/agreement";
import { sendChat, WELCOME, type ChatMessage } from "@/lib/chat";
import { DocumentPreview } from "./document-preview";
import { api, ApiError, type SavedAgreement } from "@/lib/api";

export function AgreementBuilder({ templates, saved, onExpired }: { templates: AgreementTemplate[]; saved?: SavedAgreement; onExpired: () => void }) {
  const [documentId, setDocumentId] = useState(saved?.documentId || "");
  const [drafts, setDrafts] = useState<Drafts>(() => Object.fromEntries(templates.map(template => [template.id, saved?.documentId === template.id ? saved.fields : initialDraft(template)])));
  const savedIds = useRef<Record<string, number>>(saved ? { [saved.documentId]: saved.id } : {});
  const [titles, setTitles] = useState<Record<string, string>>(saved ? { [saved.documentId]: saved.title } : {});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(saved ? "saved" : "idle");
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);
  const [suggestedId, setSuggestedId] = useState("");
  const definition = templates.find(template => template.id === documentId);
  const form = drafts[documentId];
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
  const missing = definition ? Object.values(validateAgreement(definition, form)) : [];
  const complete = !!definition && missing.length === 0;
  const document = definition ? assembleAgreement(definition, form) : null;

  function selectDocument(id: string) {
    if (busy.current || downloading.current || saving.current || id === documentId) return;
    setSaveStatus("idle");
    setSaveError("");
    setDocumentId(id);
    setSuggestedId("");
    setPdfStatus("idle");
    setMessages(previous => [...previous, { role: "assistant", content: `You selected ${templates.find(template => template.id === id)?.name}. Tell me the details you’d like to include, or ask for a different document.` }]);
  }

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, pending]);
  useEffect(() => {
    // Wait until React has re-enabled the composer before restoring keyboard focus.
    if (!pending && request.current) composer.current?.focus();
  }, [pending]);

  async function send(message = text) {
    if (busy.current || downloading.current || saving.current || !message.trim()) return;
    busy.current = true;
    const content = message.trim();
    setText(content);
    const conversation: ChatMessage[] = [...messages, { role: "user", content }];
    setPending(content);
    setChatError("");
    request.current = new AbortController();
    try {
      const result = await sendChat(conversation, documentId, drafts, request.current.signal);
      setSaveStatus("idle");
      setSaveError("");
      setDocumentId(result.documentId);
      if (result.documentId) setDrafts(previous => ({ ...previous, [result.documentId]: Object.fromEntries(result.fields.map(field => [field.id, field.value])) }));
      setSuggestedId(result.suggestedDocumentId);
      setMessages([...conversation, { role: "assistant", content: result.reply }]);
      setText("");
      setPdfStatus("idle");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { onExpired(); return; }
      if (!request.current.signal.aborted) {
        setChatError(error instanceof Error ? error.message : "Unable to send your message. Please retry.");
      }
    } finally {
      setPending("");
      busy.current = false;
    }
  }

  async function save() {
    if (!definition || saving.current) return false;
    saving.current = true;
    setSaveStatus("saving");
    setSaveError("");
    try {
      const id = savedIds.current[documentId];
      const result = await api<{ id: number } | undefined>(id ? `/api/agreements/${id}` : "/api/agreements", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({ documentId, title: titles[documentId] ?? definition.name, fields: form }),
      });
      if (result) savedIds.current[documentId] = result.id;
      setSaveStatus("saved");
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "Unable to save your document. Please retry.");
      return false;
    } finally { saving.current = false; }
  }

  async function download() {
    if (!complete || !document || busy.current || downloading.current || saving.current) return;
    downloading.current = true;
    setPdfStatus("loading");
    try {
      if (!await save()) { setPdfStatus("idle"); return; }
      const { downloadPdf } = await import("@/lib/pdf");
      await downloadPdf(document, form.effectiveDate);
      setPdfStatus("idle");
    } catch {
      setPdfStatus("error");
    } finally {
      downloading.current = false;
    }
  }

  return <div className="agreement-builder">

    <main>
      <div className="intro"><div><p className="eyebrow">A CLEAR START TO YOUR NEXT CONVERSATION</p><h1>Talk it through.<br />Put it in writing.</h1><p className="intro-copy">Tell us about your agreement. Your AI assistant will ask for what’s missing<br className="desktop-break" /> and fill your document as you chat.</p></div><div className="template-badge"><span className="badge-icon" aria-hidden="true">↗</span><div>Built on Common Paper<small>{definition ? definition.name : "11 supported document types"}</small></div></div></div>
      <section className="draft-controls" aria-label="Save your draft">
        <div><label htmlFor="draft-title">Document name</label><input id="draft-title" value={definition ? titles[documentId] ?? definition.name : ""} maxLength={180} placeholder="Choose a document to get started" disabled={!definition || !!pending || pdfStatus === "loading" || saveStatus === "saving"} onChange={event => { setTitles(previous => ({ ...previous, [documentId]: event.target.value })); setSaveStatus("idle"); }} /></div>
        <div className="save-actions"><span role="status">{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved to your account" : definition ? "Save your progress before leaving" : "Your drafts, all in one place"}</span><button className="secondary-button" disabled={!definition || !!pending || pdfStatus === "loading" || saveStatus === "saving" || !(titles[documentId] ?? definition?.name)?.trim()} onClick={() => void save()}>{saveStatus === "error" ? "Retry save" : "Save draft"}</button></div>
        {saveStatus === "error" && <p className="save-error" role="alert">{saveError} Your current draft is still here.</p>}
      </section>
      <div className="workspace">
        <section className="chat-panel" aria-labelledby="chat-heading">
          <div className="panel-heading"><h2 id="chat-heading">Draft with AI</h2><span>{definition?.name || "Choose your document"}</span></div>
          <p className="chat-privacy">Your messages and agreement details are sent to our AI service to draft your agreement. Save draft keeps the selected document in your account. Downloading also saves it. Chat messages and unsaved changes clear on reload.</p>
          <div className="document-picker"><label htmlFor="document-type">Document type</label><select id="document-type" value={documentId} disabled={!!pending || pdfStatus === "loading" || saveStatus === "saving"} onChange={event => selectDocument(event.target.value)}><option value="" disabled>Choose a document or describe it in chat</option>{templates.map(template => <option value={template.id} key={template.id}>{template.name}</option>)}</select>{definition && <p>{definition.description}</p>}</div>
          <div className="chat-transcript" role="log" aria-label="Agreement conversation" aria-live="polite" ref={transcript}>
            {messages.map((message, index) => <div className={`chat-message ${message.role}`} key={index}><strong>{message.role === "user" ? "You" : "Prelegal assistant"}</strong><p>{message.content}</p></div>)}
            {pending && <div className="chat-message user"><strong>You</strong><p>{pending}</p></div>}
          </div>
          <p className="chat-progress" role="status">{pending ? "Updating your agreement…" : complete ? "Your draft is ready to review. You can still ask for changes." : "Share details in any order. Ask for changes at any time."}</p>
          {suggestedId && <button className="alternative-button" type="button" disabled={!!pending || pdfStatus === "loading" || saveStatus === "saving"} onClick={() => void send(`Yes, use the supported ${templates.find(template => template.id === suggestedId)?.name} instead.`)}>Use {templates.find(template => template.id === suggestedId)?.name}</button>}
          {chatError && <p className="chat-error" role="alert">{chatError} Your draft and message are still here.</p>}
          <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
            <label htmlFor="chat-message">Your message</label>
            <textarea id="chat-message" ref={composer} value={text} onChange={event => setText(event.target.value)} maxLength={8000} rows={3} placeholder="e.g. We’re Acme and we’re discussing a partnership with Studio North…" disabled={!!pending || saveStatus === "saving"} required />
            <button className="chat-send" type="submit" disabled={!!pending || !text.trim() || pdfStatus === "loading" || saveStatus === "saving"}>{pending ? "Sending…" : chatError ? "Retry message" : "Send message"}<span aria-hidden="true">↗</span></button>
          </form>
          {missing.length > 0 && <details className="chat-missing"><summary>Still needed for your document ({missing.length})</summary><ul>{missing.map(label => <li key={label}>{label}</li>)}</ul></details>}
        </section>
        <section className="preview-panel" aria-labelledby="preview-heading"><div className="preview-toolbar"><div><span className="status-dot" aria-hidden="true" /><h2 id="preview-heading">Document preview</h2></div><span className={complete ? "status-pill ready" : "status-pill"}>{complete ? "Draft · Ready for review" : "Draft · Chat to complete"}</span></div>
          <div className="preview-scroll">{document ? <DocumentPreview document={document} /> : <div className="preview-empty"><h3>Start with your agreement</h3><p>Choose one of our 11 Common Paper templates, or tell the assistant what you need.</p><p>Your draft will appear here as you chat.</p></div>}</div>
          <div className="download-bar"><div><strong>{definition?.name || "Your agreement"}</strong><span>Cover page, agreement details + standard terms</span></div><button type="button" className="primary-button" onClick={() => void download()} disabled={!complete || !!pending || pdfStatus === "loading" || saveStatus === "saving" || !(titles[documentId] ?? definition?.name)?.trim()}><span aria-hidden="true">↓</span>{pdfStatus === "loading" ? "Preparing PDF…" : pdfStatus === "error" ? "Retry download" : "Download PDF"}</button></div>
          <div className="download-status" role="status">{pdfStatus === "error" ? "The PDF could not be created. Your details are still here. Please retry." : pdfStatus === "loading" ? "Creating your PDF in this browser…" : !complete ? "The assistant will help you complete the required details." : "Review your draft before downloading. Signatures and signing dates are left blank."}</div>
        </section>
      </div>

    </main>
  </div>;
}

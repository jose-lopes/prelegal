"use client";

import { useEffect, useState } from "react";
import type { AgreementTemplate } from "@/lib/agreement";
import { api, ApiError, type Account, type SavedAgreement } from "@/lib/api";
import { AgreementBuilder } from "./agreement-builder";
import { DRAFT_DISCLAIMER } from "@/lib/disclaimer";

export function Brand() {
  return <span className="brand"><span className="brand-symbol" aria-hidden="true">p.</span>prelegal</span>;
}

function AuthScreen({ onSignedIn }: { onSignedIn: (user: Account) => void }) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const user = await api<Account>(`/api/auth/${signup ? "signup" : "signin"}`, { method: "POST", body: JSON.stringify({ email, password }) });
      onSignedIn(user);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in. Please retry.");
    } finally { setBusy(false); }
  }

  return <main className="auth-page">
    <section className="auth-story" aria-label="About Prelegal">
      <Brand />
      <div><p className="eyebrow">FROM CONVERSATION TO AGREEMENT</p><h1>A clear start.<br />A shared understanding.</h1><p>Turn the details into a draft you can work with. Your agreements, together in one place.</p>
        <div className="auth-benefits"><p><span>01</span> Choose from 11 Common Paper templates</p><p><span>02</span> Work through the details with AI</p><p><span>03</span> Save, revisit, and download your drafts</p></div>
      </div>
      <p className="auth-attribution">Built on Common Paper standards · Made for your next step</p>
    </section>
    <section className="auth-form-panel" aria-labelledby="auth-heading">
      <div className="auth-card"><p className="eyebrow">YOUR AGREEMENT WORKSPACE</p><h2 id="auth-heading">{signup ? "Create your account" : "Welcome back"}</h2><p>{signup ? "Make room for your next agreement." : "Sign in to pick up where you left off."}</p>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" value={email} maxLength={254} onChange={event => setEmail(event.target.value)} required disabled={busy} placeholder="you@company.com" />
          <label htmlFor="password">Password</label><input id="password" type="password" autoComplete={signup ? "new-password" : "current-password"} value={password} minLength={12} maxLength={128} onChange={event => setPassword(event.target.value)} required disabled={busy} aria-describedby="password-hint" />
          <p id="password-hint" className="field-hint">Use 12–128 characters.</p>
          {error && <p role="alert" className="auth-error">{error}</p>}
          <button className="login-button" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}<span aria-hidden="true"> ↗</span></button>
        </form>
        <p className="auth-switch">{signup ? "Already have an account?" : "New to Prelegal?"} <button className="text-button" disabled={busy} onClick={() => { setSignup(!signup); setError(""); setPassword(""); }}>{signup ? "Sign in" : "Create an account"}</button></p>
        <p className="retention-note">Temporary workspace: accounts and saved documents are cleared whenever the server restarts. Download PDFs to keep a copy.</p>
        <p className="legal-note">{DRAFT_DISCLAIMER}</p>
      </div>
    </section>
  </main>;
}

function AccountWorkspace({ user, templates, onSignedOut }: { user: Account; templates: AgreementTemplate[]; onSignedOut: () => void }) {
  const [view, setView] = useState<"library" | "builder">("library");
  const [saved, setSaved] = useState<SavedAgreement>();
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<SavedAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (view !== "library") return;
    const controller = new AbortController();
    api<SavedAgreement[]>("/api/agreements", { signal: controller.signal }).then(result => { setItems(result); setLoading(false); }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { onSignedOut(); return; }
      setError("Unable to load your documents. Please retry."); setLoading(false);
    });
    return () => controller.abort();
  }, [view, revision, onSignedOut]);

  function showLibrary() { setLoading(true); setError(""); setView("library"); setRevision(value => value + 1); }
  async function signout() {
    setBusy(true); setError("");
    try { await api<void>("/api/auth/signout", { method: "POST" }); onSignedOut(); }
    catch { setError("Unable to sign out. Please retry."); }
    finally { setBusy(false); }
  }
  async function open(id: number) {
    setBusy(true); setError("");
    try {
      const item = await api<SavedAgreement>(`/api/agreements/${id}`);
      setSaved(item); setView("builder"); setRevision(value => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onSignedOut();
      else setError("Unable to open this document. Please retry.");
    } finally { setBusy(false); }
  }

  return <div className="chat-builder account-workspace">
    <header className="site-header"><button type="button" className="brand-button" onClick={showLibrary} aria-label="Prelegal home"><Brand /></button><nav aria-label="Account"><button className="text-button" onClick={showLibrary}>My documents</button><span className="account-email" title={user.email}>{user.email}</span><button className="secondary-button" disabled={busy} onClick={() => void signout()}>Sign out</button></nav></header>
    <div className="workspace-notice"><span className="notice-dot" aria-hidden="true" />{DRAFT_DISCLAIMER}</div>
    {error && <p role="alert" className="workspace-error">{error} {view === "library" && <button className="text-button" onClick={() => { setError(""); setLoading(true); setRevision(value => value + 1); }}>Retry</button>}</p>}
    {view === "builder" ? <AgreementBuilder key={revision} templates={templates} saved={saved} onExpired={onSignedOut} /> : <main className="library-page">
      <div className="library-intro"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>My documents</h1><p>Good agreements start with a conversation.</p></div><button className="create-button" onClick={() => { setSaved(undefined); setRevision(value => value + 1); setView("builder"); }}>+ New agreement</button></div>
      {loading ? <p role="status" className="library-empty">Loading your documents…</p> : items.length === 0 && !error ? <section className="library-empty"><span className="empty-icon" aria-hidden="true">▤</span><h2>Your next agreement starts here</h2><p>Draft with AI, save your progress, and return whenever you’re ready.</p><button className="secondary-button" onClick={() => { setSaved(undefined); setView("builder"); }}>Create your first agreement</button></section> : <section className="document-grid" aria-label="Saved documents">{items.map(item => <button className="document-card" disabled={busy} key={item.id} onClick={() => void open(item.id)}><span className="document-card-top"><span className="card-icon" aria-hidden="true">▤</span><span className="status-pill">Draft</span></span><h2>{item.title}</h2><p>{templates.find(template => template.id === item.documentId)?.name}</p><span className="document-card-bottom"><time dateTime={`${item.updatedAt.replace(" ", "T")}Z`}>Updated {new Date(`${item.updatedAt.replace(" ", "T")}Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time><span>Open draft ↗</span></span></button>)}</section>}
      <p className="retention-note">Saved to your account until the server restarts. Download a PDF to keep a lasting copy.</p>
    </main>}
    <footer className="account-footer"><span>prelegal <span className="footer-divider">/</span> Less paperwork. More possibility.</span><span>Based on <a href="https://commonpaper.com/standards/">Common Paper</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></span></footer>
  </div>;
}

export function AccountApp({ templates }: { templates: AgreementTemplate[] }) {
  const [user, setUser] = useState<Account | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Account>("/api/auth/session", { signal: controller.signal }).then(setUser).catch(error => {
      if (!controller.signal.aborted && !(error instanceof ApiError && error.status === 401)) setError("Unable to connect to your workspace.");
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [attempt]);
  if (checking) return <main className="session-screen" role="status"><Brand /><p>Opening your workspace…</p></main>;
  if (error) return <main className="session-screen"><Brand /><p role="alert">{error}</p><button className="secondary-button" onClick={() => { setError(""); setChecking(true); setAttempt(value => value + 1); }}>Retry connection</button></main>;
  return user ? <AccountWorkspace key={user.id} user={user} templates={templates} onSignedOut={() => setUser(null)} /> : <AuthScreen onSignedIn={setUser} />;
}

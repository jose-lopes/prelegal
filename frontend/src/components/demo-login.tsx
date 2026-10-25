"use client";

import { useState } from "react";
import type { AgreementTemplate } from "@/lib/agreement";
import { AgreementBuilder } from "./agreement-builder";

export function DemoLogin({ templates }: { templates: AgreementTemplate[] }) {
  const [entered, setEntered] = useState(false);

  if (entered) return <AgreementBuilder templates={templates} />;

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-heading">
      <div className="brand"><span className="brand-symbol" aria-hidden="true">p.</span>prelegal</div>
      <p className="eyebrow">LESS PAPERWORK. MORE POSSIBILITY.</p>
      <h1 id="login-heading">Welcome to Prelegal</h1>
      <p>Create, preview, and download your legal agreement.</p>
      <button className="login-button" type="button" onClick={() => setEntered(true)}>Continue</button>
      <p className="login-note">Demo access · No account or password needed.</p>
    </section>
  </main>;
}

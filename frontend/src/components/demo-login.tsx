"use client";

import { useState } from "react";
import type { Template } from "@/lib/nda";
import { NdaBuilder } from "./nda-builder";

export function DemoLogin({ template }: { template: Template }) {
  const [entered, setEntered] = useState(false);

  if (entered) return <NdaBuilder template={template} />;

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-heading">
      <div className="brand"><span className="brand-symbol" aria-hidden="true">p.</span>prelegal</div>
      <p className="eyebrow">LESS PAPERWORK. MORE POSSIBILITY.</p>
      <h1 id="login-heading">Welcome to Prelegal</h1>
      <p>Create, preview, and download your mutual NDA.</p>
      <button className="login-button" type="button" onClick={() => setEntered(true)}>Continue</button>
      <p className="login-note">Demo access · No account or password needed.</p>
    </section>
  </main>;
}

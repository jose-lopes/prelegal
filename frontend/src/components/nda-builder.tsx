"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { assembleDocument, initialForm, localDate, STATES, validate, type Field, type NdaForm, type Party, type Template } from "@/lib/nda";
import { DocumentPreview } from "./document-preview";

type Status = "idle" | "loading" | "error";

export function NdaBuilder({ template }: { template: Template }) {
  const [form, setForm] = useState(initialForm);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const downloading = useRef(false);
  const errors = validate(form);
  const complete = Object.keys(errors).length === 0;
  const document = assembleDocument(form, template);
  // Use the browser's date, not the build server's clock or timezone.
  useEffect(() => { setForm(current => ({ ...current, effectiveDate: localDate() })); }, []);

  function update(field: Field, text: string) {
    setStatus("idle");
    if (field.startsWith("party")) {
      const [party, key] = field.split(".") as ["party1" | "party2", keyof Party];
      setForm(current => ({ ...current, [party]: { ...current[party], [key]: text } }));
    } else {
      setForm(current => ({ ...current, [field]: text }));
    }
  }

  async function download() {
    if (downloading.current) return;
    setAttempted(true);
    if (!complete) {
      window.document.getElementById(Object.keys(errors)[0])?.focus();
      return;
    }
    downloading.current = true;
    setStatus("loading");
    try {
      const { downloadPdf } = await import("@/lib/pdf");
      await downloadPdf(document, form.effectiveDate);
      setStatus("idle");
    } catch (error) {
      console.error("Unable to generate the NDA PDF.", error);
      setStatus("error");
    } finally {
      downloading.current = false;
    }
  }

  const fieldError = (field: Field) => (attempted || touched[field]) ? errors[field] : undefined;

  function input(field: Field, label: string, options: { textarea?: boolean; type?: string; placeholder?: string; optional?: boolean; hint?: string } = {}) {
    const text = field.startsWith("party") ? (() => { const [p, k] = field.split(".") as ["party1" | "party2", keyof Party]; return form[p][k]; })() : form[field as Exclude<keyof NdaForm, "party1" | "party2">];
    const error = fieldError(field);
    const props = {
      id: field, name: field, value: text, required: !options.optional,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(field, event.target.value),
      onBlur: () => setTouched(current => ({ ...current, [field]: true })),
      "aria-invalid": !!error, "aria-describedby": error ? `${field}-error` : options.hint ? `${field}-hint` : undefined,
      placeholder: options.placeholder,
    };
    return <div className="field" key={field}>
      <label htmlFor={field}>{label}{options.optional && <span className="optional">Optional</span>}</label>
      {options.textarea ? <textarea {...props} rows={field === "modifications" ? 3 : 2} /> : <input {...props} type={options.type || "text"} {...(options.type === "number" ? { min: 1, step: 1 } : {})} />}
      {error ? <p className="field-error" id={`${field}-error`}>{error}</p> : options.hint ? <p className="field-hint" id={`${field}-hint`}>{options.hint}</p> : null}
    </div>;
  }

  function group(number: string, title: string, subtitle: string, children: ReactNode) {
    return <fieldset className="form-section"><legend><span className="step-number">{number}</span>{title}</legend><p className="section-subtitle">{subtitle}</p>{children}</fieldset>;
  }

  function duration(kind: "term" | "confidentiality") {
    const isTerm = kind === "term";
    const modeField = isTerm ? "termMode" : "confidentialityMode";
    const yearsField = isTerm ? "termYears" : "confidentialityYears";
    const label = isTerm ? "Agreement duration" : "Confidentiality duration";
    return <div className="duration-group"><label htmlFor={modeField}>{label}</label>
      <div className="duration-row"><select id={modeField} value={form[modeField]} onChange={event => update(modeField, event.target.value)}>
        <option value="fixed">Fixed duration</option><option value={isTerm ? "indefinite" : "perpetual"}>{isTerm ? "Until terminated" : "In perpetuity"}</option>
      </select>{form[modeField] === "fixed" && input(yearsField, isTerm ? "Agreement years" : "Confidentiality years", { type: "number" })}</div>
      <p className="field-hint">{isTerm ? "Measured from the effective date." : "Fixed terms protect trade secrets for as long as they remain trade secrets."}</p>
    </div>;
  }

  return <>
    <header className="site-header"><Link className="brand" href="/" aria-label="Prelegal home"><span className="brand-symbol" aria-hidden="true">p.</span>prelegal<span className="prototype-tag">PROTOTYPE</span></Link><span className="privacy-note"><span aria-hidden="true">◈</span> Your details stay in your browser</span></header>
    <main>
      <div className="intro"><div><p className="eyebrow">A CLEAR START TO YOUR NEXT CONVERSATION</p><h1>Keep your ideas<br className="mobile-break" /> in confidence.</h1><p className="intro-copy">Create a mutual NDA in a few simple steps. Add your details,<br className="desktop-break" /> review the agreement, and download a ready-to-sign PDF.</p></div><div className="template-badge"><span className="badge-icon" aria-hidden="true">↗</span><div>Built on Common Paper<small>Mutual NDA · Version 1.0</small></div></div></div>
      <div className="workspace">
        <div className="form-panel"><div className="panel-heading"><h2>Agreement details</h2><span>01 — 04</span></div>
          <form noValidate onSubmit={event => { event.preventDefault(); void download(); }}>
            {group("01", "The parties", "Who will be sharing confidential information?", <>
              {(["party1", "party2"] as const).map((party, index) => <div className="party-fields" key={party}><h3>PARTY {index + 1}</h3>
                {input(`${party}.company`, "Company / legal name", { placeholder: index === 0 ? "e.g. Acme, Inc." : "e.g. Studio North, LLC" })}
                <div className="field-pair">{input(`${party}.name`, "Signatory name", { placeholder: "Full name" })}{input(`${party}.title`, "Signatory title", { placeholder: "e.g. CEO" })}</div>
                {input(`${party}.address`, "Notice address", { textarea: true, placeholder: "Email or postal address", hint: "Where this party will receive notices under the agreement." })}
              </div>)}
            </>)}
            {group("02", "Purpose & timing", "Define the conversation and how long it stays protected.", <>
              {input("purpose", "Purpose", { textarea: true })}{input("effectiveDate", "Effective date", { type: "date" })}{duration("term")}{duration("confidentiality")}
            </>)}
            {group("03", "Governing law", "Choose the law and courts that govern this agreement.", <>
              <div className="field"><label htmlFor="governingLaw">Governing US state</label><select id="governingLaw" value={form.governingLaw} required onChange={event => update("governingLaw", event.target.value)} onBlur={() => setTouched(current => ({ ...current, governingLaw: true }))} aria-invalid={!!fieldError("governingLaw")} aria-describedby={fieldError("governingLaw") ? "governingLaw-error" : undefined}><option value="">Select a state</option>{STATES.map(state => <option key={state}>{state}</option>)}</select>{fieldError("governingLaw") && <p id="governingLaw-error" className="field-error">{fieldError("governingLaw")}</p>}</div>
              {input("jurisdiction", "Court location", { placeholder: "e.g. New Castle County, Delaware", hint: "City or county and state where federal or state courts are located." })}
            </>)}
            {group("04", "Modifications", "Add any agreed changes to the standard terms.", input("modifications", "MNDA modifications", { textarea: true, optional: true, placeholder: "Leave blank if there are no modifications." }))}
            <div className="form-bottom"><p>Signatures and signing dates are left blank for both parties to complete.</p><button className="review-button" type="submit">{complete ? "Download PDF" : "Check required fields"}<span aria-hidden="true">↗</span></button></div>
          </form>
        </div>
        <section className="preview-panel" aria-labelledby="preview-heading"><div className="preview-toolbar"><div><span className="status-dot" aria-hidden="true" /><h2 id="preview-heading">Document preview</h2></div><span className={complete ? "status-pill ready" : "status-pill"}>{complete ? "Ready to download" : "Draft · Fill in your details"}</span></div>
          <div className="preview-scroll"><DocumentPreview document={document} /></div>
          <div className="download-bar"><div><strong>Your mutual NDA</strong><span>Complete cover page + standard terms</span></div><button type="button" className="primary-button" onClick={() => void download()} disabled={!complete || status === "loading"}><span aria-hidden="true">↓</span>{status === "loading" ? "Preparing PDF…" : status === "error" ? "Retry download" : "Download PDF"}</button></div>
          <div className="download-status" role="status" aria-live="polite">{status === "error" ? "The PDF could not be created. Your details are still here. Please retry." : status === "loading" ? "Creating your PDF in this browser…" : !complete ? "Complete all required fields to download your agreement." : "Ready to download. Your information is not saved."}</div>
        </section>
      </div>
      <footer className="site-footer"><span>prelegal <span className="footer-divider">/</span> Less paperwork. More possibility.</span><span>Based on <a href="https://commonpaper.com/standards/mutual-nda/1.0/">Common Paper</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></span></footer>
    </main>
  </>;
}

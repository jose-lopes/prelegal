import { LICENSE_URL } from "@/lib/nda";
import type { AgreementDocument } from "@/lib/agreement";
import { DRAFT_DISCLAIMER } from "@/lib/disclaimer";

export function DocumentPreview({ document }: { document: AgreementDocument }) {
  return <article className="document" aria-label="Completed agreement preview">
    <div className="document-kicker">COMMON PAPER{document.version && ` · VERSION ${document.version}`}</div>
    <h2>{document.title}</h2>
    <p className="document-subtitle">Cover Page</p>
    <p className="document-disclaimer">Draft · {DRAFT_DISCLAIMER}</p>
    <p>{document.introduction}</p>
    {document.sections.map(section => <section key={section.heading}>
      <h3>{section.heading}</h3><p className="preserve-lines">{section.text}</p>
    </section>)}
    <p className="signing-intro">{document.signingText}</p>
    <div className="signature-grid">{document.parties.map((party, index) => <section key={index}>
      <h3>{document.roles[index]}</h3>
      <dl>{[["Company / legal name", party.company], ["Print name", party.name], ["Title", party.title], ["Notice address", party.address]].map(([label, text]) => <div key={label}><dt>{label}</dt><dd className="preserve-lines">{text}</dd></div>)}</dl>
      <p className="signature-line">Signature</p><p className="signature-line">Date</p>
    </section>)}</div>
    <div className="standard-terms"><h2>Standard Terms</h2>
      {document.clauses.map(clause => <section key={clause.heading}><h3>{clause.heading}</h3><p className="preserve-lines">{clause.text}</p></section>)}
    </div>
    <footer className="document-attribution"><p>{document.attribution}</p>
      <p><a href={LICENSE_URL}>CC BY 4.0</a> · <a href={document.sourceUrl}>Source</a></p>
    </footer>
  </article>;
}

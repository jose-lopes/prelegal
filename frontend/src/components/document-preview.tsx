import { ATTRIBUTION, LICENSE_URL, SIGNING_TEXT, STANDARD_URL, type NdaDocument } from "@/lib/nda";

export function DocumentPreview({ document }: { document: NdaDocument }) {
  return <article className="document" aria-label="Completed NDA preview">
    <div className="document-kicker">COMMON PAPER · VERSION 1.0</div>
    <h2>Mutual Non-Disclosure<br />Agreement</h2>
    <p className="document-subtitle">Cover Page</p>
    <p>{document.introduction}</p>
    {document.sections.map(section => <section key={section.heading}>
      <h3>{section.heading}</h3><p className="preserve-lines">{section.text}</p>
    </section>)}
    <p className="signing-intro">{SIGNING_TEXT}</p>
    <div className="signature-grid">{document.parties.map((party, index) => <section key={index}>
      <h3>Party {index + 1}</h3>
      <dl>{[["Company / legal name", party.company], ["Print name", party.name], ["Title", party.title], ["Notice address", party.address]].map(([label, text]) => <div key={label}><dt>{label}</dt><dd className="preserve-lines">{text}</dd></div>)}</dl>
      <p className="signature-line">Signature</p><p className="signature-line">Date</p>
    </section>)}</div>
    <div className="standard-terms"><h2>Standard Terms</h2>
      {document.clauses.map(clause => <section key={clause.heading}><h3>{clause.heading}</h3><p>{clause.text}</p></section>)}
    </div>
    <footer className="document-attribution"><p>{ATTRIBUTION}</p>
      <p><a href={STANDARD_URL}>Common Paper Mutual NDA v1.0</a> · <a href={LICENSE_URL}>CC BY 4.0</a> · <a href={document.sourceUrl}>Source</a></p>
    </footer>
  </article>;
}

import { Document, Font, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { ATTRIBUTION, LICENSE_URL, SIGNING_TEXT, STANDARD_URL, type NdaDocument } from "./nda";

function registerFonts() {
  // React PDF also resolves Helvetica as a fallback, even for a custom family.
  // Font.clear() removes these built-ins along with failed custom font loads.
  if (!Font.getRegisteredFontFamilies().includes("Helvetica")) {
    Font.register({ family: "Helvetica", fonts: [
      { src: "Helvetica", fontWeight: 400 },
      { src: "Helvetica-Bold", fontWeight: 700 },
      { src: "Helvetica-Oblique", fontWeight: 400, fontStyle: "italic" },
      { src: "Helvetica-BoldOblique", fontWeight: 700, fontStyle: "italic" },
    ] });
  }
  Font.register({ family: "Noto Sans", fonts: [
    { src: "/fonts/noto-sans-regular.ttf", fontWeight: 400 },
    { src: "/fonts/noto-sans-semibold.ttf", fontWeight: 600 },
  ] });
  Font.registerHyphenationCallback(word => [word]);
}
registerFonts();

const styles = StyleSheet.create({
  page: { padding: 48, paddingBottom: 60, fontFamily: "Noto Sans", fontSize: 9, lineHeight: 1.55, color: "#202c32" },
  title: { fontSize: 23, fontWeight: 600, marginBottom: 10 },
  subtitle: { fontSize: 11, marginBottom: 18, color: "#496559" },
  heading: { fontWeight: 600, fontSize: 10, marginTop: 13, marginBottom: 4 },
  paragraph: { marginBottom: 6 },
  parties: { flexDirection: "row", gap: 24, marginTop: 12 },
  party: { flex: 1 },
  label: { fontSize: 8, color: "#5c6668", marginTop: 6 },
  signature: { marginTop: 32, borderTopWidth: 0.5, borderTopColor: "#a5aeaa", paddingTop: 4, fontSize: 8 },
  attribution: { fontSize: 8, borderTopWidth: 0.5, borderTopColor: "#a5aeaa", marginTop: 22, paddingTop: 10 },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, fontSize: 8, color: "#69736e", textAlign: "right" },
  link: { color: "#285d49" },
});

export function NdaPdf({ document }: { document: NdaDocument }) {
  return <Document title="Mutual Non-Disclosure Agreement" author="Prelegal · Common Paper">
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>Mutual Non-Disclosure Agreement</Text><Text style={styles.subtitle}>Cover Page · Common Paper Version 1.0</Text>
      <Text style={styles.paragraph}>{document.introduction}</Text>
      {document.sections.map(section => <View key={section.heading}><Text style={styles.heading} minPresenceAhead={24}>{section.heading}</Text><Text style={styles.paragraph} orphans={2} widows={2}>{section.text}</Text></View>)}
      <Text style={[styles.paragraph, { marginTop: 18 }]}>{SIGNING_TEXT}</Text>
      <View style={styles.parties}>{document.parties.map((party, index) => <View key={index} style={styles.party}>
        <Text style={styles.heading}>Party {index + 1}</Text>
        {[["Company / legal name", party.company], ["Print name", party.name], ["Title", party.title], ["Notice address", party.address]].map(([label, text]) => <View key={label}><Text style={styles.label}>{label}</Text><Text>{text}</Text></View>)}
        <Text style={styles.signature}>Signature</Text><Text style={styles.signature}>Date</Text>
      </View>)}</View>
      <Text fixed style={styles.footer} render={({ pageNumber, totalPages }) => `Common Paper Mutual NDA v1.0 · ${pageNumber} / ${totalPages}`} />
    </Page>
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>Standard Terms</Text>
      {document.clauses.map(clause => <View key={clause.heading}><Text style={styles.heading} minPresenceAhead={24}>{clause.heading}</Text><Text style={styles.paragraph} orphans={2} widows={2}>{clause.text}</Text></View>)}
      <View style={styles.attribution}><Text>{ATTRIBUTION}</Text><Link src={STANDARD_URL} style={styles.link}>Common Paper Mutual NDA v1.0</Link><Link src={LICENSE_URL} style={styles.link}>CC BY 4.0</Link><Link src={document.sourceUrl} style={styles.link}>Pinned template source</Link></View>
      <Text fixed style={styles.footer} render={({ pageNumber, totalPages }) => `Common Paper Mutual NDA v1.0 · ${pageNumber} / ${totalPages}`} />
    </Page>
  </Document>;
}

export async function downloadPdf(document: NdaDocument, effectiveDate: string) {
  let blob: Blob;
  try {
    // The store constructor normally preloads its built-in fallback faces.
    // After clearing a failed load, preload the restored faces before layout.
    await Promise.all(([400, 700] as const).flatMap(fontWeight =>
      (["normal", "italic"] as const).map(fontStyle => Font.load({ fontFamily: "Helvetica", fontWeight, fontStyle })),
    ));
    blob = await pdf(<NdaPdf document={document} />).toBlob();
  } catch (error) {
    // The renderer caches rejected font-load promises. Replace the registry so
    // a temporary font fetch failure can be retried without reloading the form.
    Font.clear();
    registerFonts();
    throw error;
  }
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `mutual-nda-${effectiveDate}.pdf`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to start reading the blob before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

import path from "node:path";
import { expect, it } from "vitest";
import { Font, pdf } from "@react-pdf/renderer";
import { AgreementPdf } from "../src/lib/pdf";
import { assembleAgreement, initialDraft } from "../src/lib/agreement";
import { loadTemplates } from "../src/lib/template";

it.each(["mutual-nda", "cloud-service-agreement"])("retains party details in a paginated PDF: %s", async id => {
  // Node rendering uses local files; browser downloads use the bundled font URLs.
  Font.clear();
  Font.register({ family: "Helvetica", fonts: [{ src: "Helvetica", fontWeight: 400 }, { src: "Helvetica-Bold", fontWeight: 700 }] });
  Font.register({ family: "Noto Sans", fonts: [
    { src: path.resolve("public/fonts/noto-sans-regular.ttf"), fontWeight: 400 },
    { src: path.resolve("public/fonts/noto-sans-semibold.ttf"), fontWeight: 600 },
  ] });
  await Promise.all([400, 700].map(fontWeight => Font.load({ fontFamily: "Helvetica", fontWeight })));
  const definition = loadTemplates().find(item => item.id === id)!;
  const fields = initialDraft(definition);
  for (const field of definition.fields) fields[field.id] = field.choices?.[0] || (field.type === "date" ? "2026-10-24" : field.type === "years" ? "2" : field.type === "us-state" ? "Delaware" : `${field.label}: José & Zoë <Research>`);
  const blob = await pdf(AgreementPdf({ document: assembleAgreement(definition, fields) })).toBlob();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false, standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/` });
  const document = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= document.numPages; n++) {
    const content = await (await document.getPage(n)).getTextContent();
    pages.push(content.items.map(item => "str" in item ? item.str : "").join(" "));
  }
  const text = pages.join(" ").replace(/\s+/g, " ");
  for (const party of ["party1", "party2"]) for (const field of ["company", "name", "title", "address"]) expect(text).toContain(fields[`${party}.${field}`]);
  expect(text).toContain("Standard Terms unchanged");
  await task.destroy();
});

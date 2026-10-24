import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleDocument, initialForm, localDate, validate, type NdaForm } from "../src/lib/nda";
import { loadTemplate } from "../src/lib/template";

function completed(): NdaForm {
  return { ...initialForm(), party1: { company: "Acme, Inc.", name: "José Silva", title: "CEO", address: "jose@example.com" }, party2: { company: "Studio North", name: "Zoë North", title: "Director", address: "123 Main St\nNew Castle, DE" }, effectiveDate: "2026-10-24", governingLaw: "Delaware", jurisdiction: "New Castle County, Delaware" };
}

describe("NDA inputs", () => {
  it("requires party, purpose, date, law and jurisdiction details", () => {
    expect(Object.keys(validate(initialForm()))).toHaveLength(11);
    expect(validate(completed())).toEqual({});
    expect(validate({ ...completed(), purpose: "   " }).purpose).toBeTruthy();
    expect(validate({ ...completed(), party1: { ...completed().party1, name: " " } })["party1.name"]).toBeTruthy();
  });
  it.each(["0", "-1", "1.5", "", "abc", "9007199254740992"])("rejects invalid active durations: %s", years => {
    const errors = validate({ ...completed(), termYears: years, confidentialityYears: years });
    expect(errors.termYears).toBeTruthy();
    expect(errors.confidentialityYears).toBeTruthy();
  });
  it("ignores inactive fixed durations", () => {
    const form: NdaForm = { ...completed(), termMode: "indefinite", termYears: "", confidentialityMode: "perpetual", confidentialityYears: "" };
    expect(validate(form)).toEqual({});
    const doc = assembleDocument(form, loadTemplate());
    expect(doc.sections[2].text).toContain("Continues until terminated");
    expect(doc.sections[3].text).toBe("In perpetuity.");
  });
  it.each(["2026-02-30", "2026-13-01", "2026-2-01", "bad", "0000-01-01"])("rejects invalid dates: %s", effectiveDate => {
    expect(validate({ ...completed(), effectiveDate }).effectiveDate).toBeTruthy();
  });
  it("accepts leap days and does not shift calendar dates", () => {
    const form = { ...completed(), effectiveDate: "2028-02-29" };
    expect(validate(form)).toEqual({});
    expect(assembleDocument(form, loadTemplate()).sections[1].text).toBe("February 29, 2028");
    const local = new Date(2026, 0, 2, 0, 1);
    expect(localDate(local)).toBe("2026-01-02");
  });
  it("rejects governing law that does not match the template's US-state scope", () => {
    expect(validate({ ...completed(), governingLaw: "Portugal" }).governingLaw).toBeTruthy();
  });
});

describe("document assembly and provenance", () => {
  it("preserves all 11 standard clauses and the exact source snapshot", () => {
    const template = loadTemplate();
    const catalog = JSON.parse(readFileSync("../templates/catalog.json", "utf8"));
    const source = catalog.templates.find((t: { id: string }) => t.id === "mutual-nda");
    for (const file of source.documents) {
      expect(createHash("sha256").update(readFileSync(path.join("../templates", file.path))).digest("hex")).toBe(file.sha256);
    }
    expect(template.clauses).toHaveLength(11);
    const raw = readFileSync("../templates/Mutual-NDA/Mutual-NDA.md", "utf8");
    const plain = (text: string) => text.replace(/<\/?span(?: class="coverpage_link")?>/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    const sourceClauses = raw.slice(raw.indexOf("1. **Introduction"), raw.lastIndexOf("\n\nCommon Paper"));
    const actual = template.clauses.map(clause => `${clause.heading} ${clause.text}`).join(" ");
    expect(plain(actual)).toBe(plain(sourceClauses));
    const doc = assembleDocument(completed(), template);
    expect(doc.clauses).toEqual(template.clauses);
    expect(doc.sourceUrl).toContain(source.source.commit);
    expect(doc.introduction).toContain("Cover Page, which will control over conflicts");
  });
  it("preserves trade-secret protection and every user-entered value as literal text", () => {
    const form = { ...completed(), modifications: "<script>alert('x')</script>\nAgreed modification.", purpose: "Evaluate A & B <Co>.", termYears: "2", confidentialityYears: "3" };
    const doc = assembleDocument(form, loadTemplate());
    expect(doc.sections[0].text).toBe(form.purpose);
    expect(doc.sections[2].text).toBe("Expires 2 years from Effective Date.");
    expect(doc.sections[3].text).toContain("3 years from Effective Date, but in the case of trade secrets");
    expect(doc.sections[5].text).toBe(form.modifications);
    expect(doc.parties[1].address).toBe(form.party2.address);
    expect(doc.parties[0].name).toBe("José Silva");
    expect(assembleDocument(completed(), loadTemplate()).sections[5].text).toBe("None.");
  });
  it("marks incomplete values and keeps signatures out of form data", () => {
    const doc = assembleDocument(initialForm(), loadTemplate());
    expect(doc.parties[0].company).toContain("required]");
    expect(doc.sections[1].text).toBe("[Effective date required]");
    expect(doc.parties[0]).not.toHaveProperty("signature");
    expect(doc.parties[0]).not.toHaveProperty("signingDate");
  });
});

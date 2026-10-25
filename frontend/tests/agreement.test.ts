import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assembleAgreement, initialDraft, validateAgreement } from "../src/lib/agreement";
import { loadTemplates, plainTemplate, standardSections } from "../src/lib/template";

const templates = loadTemplates();
const catalog = JSON.parse(readFileSync("../templates/catalog.json", "utf8"));
const words = (text: string) => text.replace(/\s+/g, " ").trim();

describe("all catalog agreements", () => {
  it("matches all 11 catalog types with unique fields and valid conditions", () => {
    expect(templates.map(item => item.id).sort()).toEqual(catalog.templates.map((item: { id: string }) => item.id).sort());
    expect(templates).toHaveLength(11);
    for (const definition of templates) {
      expect(new Set(definition.fields.map(field => field.id)).size).toBe(definition.fields.length);
      for (const field of definition.fields) if (field.when) expect(definition.fields.some(other => other.id === field.when!.field)).toBe(true);
    }
  });
  it.each(templates)("preserves every standard term and source checksum: $id", definition => {
    const entry = catalog.templates.find((entry: { id: string }) => entry.id === definition.id);
    for (const file of entry.documents) expect(createHash("sha256").update(readFileSync(`../templates/${file.path}`)).digest("hex")).toBe(file.sha256);
    if (definition.id === "mutual-nda") return;
    const raw = readFileSync(`../templates/${entry.documents[0].path}`, "utf8");
    // Compare all legal text independent of source list markers and rendering headings.
    const source = words(plainTemplate(raw.replace(/^#.*$/gm, "").replace(/^\s*(\d+|[a-z]+)\.\s+/gm, "")));
    const rendered = words(definition.template.clauses.map(section => `${section.heading.replace(/^[\d.a-z]+\.\s*/, "")} ${section.text}`).join(" "));
    expect(rendered).toBe(source);
    expect(definition.template.sourceUrl).toContain(entry.source.commit);
  });
  it.each(templates)("accounts for every annotated variable: $id", definition => {
    if (definition.id === "mutual-nda") return;
    const entry = catalog.templates.find((entry: { id: string }) => entry.id === definition.id);
    const raw = readFileSync(`../templates/${entry.documents[0].path}`, "utf8");
    const aliases: Record<string,string> = { "Subscription Periods": "Subscription Period", "Deliverable": "Deliverables", "Customer Covered Claims": "Customer Covered Claim", "Provider Covered Claims": "Provider Covered Claim", "Partner Covered Claims": "Partner Covered Claim", "BAA Effective Date": "Effective Date" };
    const covered = new Set([...definition.roles, "Notice Address", "Effective Date", ...definition.fields.map(field => field.label)]);
    for (const match of raw.matchAll(/<span class="[^"]*link"[^>]*>(.*?)<\/span>/g)) {
      const label = match[1].replace(/['’]s$/, "");
      expect(covered.has(aliases[label] || label), `Unmapped variable: ${label}`).toBe(true);
    }
  });
  it.each(templates)("assembles incomplete and completed drafts: $id", definition => {
    const draft = initialDraft(definition);
    expect(Object.keys(validateAgreement(definition, draft)).length).toBeGreaterThan(0);
    for (const field of definition.fields) draft[field.id] = field.choices?.[0] || (field.type === "date" ? "2026-10-24" : field.type === "years" ? "2" : field.type === "percent" ? "99.9%" : field.type === "us-state" ? "Delaware" : "User supplied <value> & José");
    expect(validateAgreement(definition, draft)).toEqual({});
    const document = assembleAgreement(definition, draft);
    expect(document.clauses).toEqual(definition.template.clauses);
    expect(document.title).toBe(definition.name);
    expect(document.attribution).toContain("Standard Terms unchanged");
    expect(document.parties[0].company).toContain("<value>");
    expect(document.parties[0]).not.toHaveProperty("signature");
  });
  it("requires dependent training details only when permitted", () => {
    const definition = templates.find(item => item.id === "ai-addendum")!;
    const draft = initialDraft(definition);
    draft.trainingPermission = "not permitted";
    expect(validateAgreement(definition, draft)).not.toHaveProperty("training-data");
    draft.trainingPermission = "permitted";
    expect(validateAgreement(definition, draft)).toHaveProperty("training-data");
    expect(validateAgreement(definition, draft)).toHaveProperty("training-purposes");
  });
  it("keeps hierarchical numbering, continuation paragraphs, links and definitions", () => {
    const sections = standardSections('# Title\n1. <span class="header_2">Terms</span>\n    1. <span class="header_3">Use.</span> Some text.\n\n        a. More.\n\n            i. Detail <https://example.com>.\n                Continuation.\n    2. **"Definition"** means something.');
    expect(sections.map(section => section.heading)).toEqual(["1. Terms", "1.1. Use.", "1.1.a.", "1.1.a.i.", "1.2."]);
    expect(sections[3].text).toBe("Detail https://example.com.\nContinuation.");
  });
});

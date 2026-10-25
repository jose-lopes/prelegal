import { readFileSync } from "node:fs";
import path from "node:path";
import type { Template } from "./nda";
import type { AgreementTemplate, DocumentDefinition } from "./agreement";

// This loader runs only in the server/build process. Agreement inputs never reach it.
export function loadTemplate(): Template {
  const root = path.resolve(process.cwd(), "../templates");
  const catalog = JSON.parse(readFileSync(path.join(root, "catalog.json"), "utf8"));
  const entry = catalog.templates.find((item: { id: string }) => item.id === "mutual-nda");
  if (!entry) throw new Error("Mutual NDA is missing from the template catalog.");
  const read = (role: string) => {
    const document = entry.documents.find((item: { role: string }) => item.role === role);
    if (!document) throw new Error(`Missing Mutual NDA ${role}.`);
    return { text: readFileSync(path.join(root, document.path), "utf8"), sourceUrl: document.source_url as string };
  };
  // Only remove known formatting from the trusted template, never parse user text as HTML.
  const plain = (text: string) => text.replace(/<\/?span(?: class="coverpage_link")?>/g, "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").trim();
  const cover = read("cover_page");
  const terms = read("standard_terms");
  const introduction = cover.text.split("\n\n").find(paragraph => paragraph.startsWith("This Mutual Non-Disclosure Agreement"));
  if (!introduction) throw new Error("Missing cover page introduction.");
  const clauses = [...terms.text.matchAll(/^(\d+)\. \*\*([^*]+)\*\*\.? ([\s\S]*?)(?=\n\n\d+\. |\n\nCommon Paper|$)/gm)].map(match => ({ heading: `${match[1]}. ${match[2].replace(/\.$/, "")}.`, text: plain(match[3]) }));
  if (clauses.length !== 11) throw new Error("Expected all 11 Mutual NDA standard clauses.");
  return { introduction: plain(introduction), clauses, sourceUrl: terms.sourceUrl };
}

// Render only trusted template formatting; user-provided values remain literal text.
export function plainTemplate(text: string): string {
  return text.replace(/<\/?span[^>]*>/g, "").replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/<(https?:[^>]+)>/g, "$1");
}

export function standardSections(text: string) {
  const sections: Template["clauses"] = [];
  const parents: { indent: number; number: string }[] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (/^#/.test(line) || !line.trim()) continue;
    const item = line.match(/^(\s*)(\d+|[a-z]+)\.\s+(.*)$/);
    if (!item) {
      if (sections.length) sections[sections.length - 1].text += `\n${plainTemplate(line.trim())}`;
      continue;
    }
    const indent = item[1].length;
    while (parents.length && parents[parents.length - 1].indent >= indent) parents.pop();
    const number = [...parents.map(parent => parent.number), item[2]].join(".") + ".";
    parents.push({ indent, number: item[2] });
    const header = item[3].match(/^<span class="header_[23]"[^>]*>(.*?)<\/span>\s*/);
    let heading = number + (header ? ` ${plainTemplate(header[1])}` : "");
    let body = header ? item[3].slice(header[0].length) : item[3];
    // Some sources place the heading's punctuation outside its span.
    if (header && body.startsWith(".")) { heading += "."; body = body.slice(1).trimStart(); }
    sections.push({ heading, text: plainTemplate(body) });
  }
  if (!sections.length) throw new Error("Template has no standard terms.");
  return sections;
}

export function loadTemplates(): AgreementTemplate[] {
  const root = path.resolve(process.cwd(), "../templates");
  const definitions: DocumentDefinition[] = JSON.parse(readFileSync(path.resolve(process.cwd(), "../backend/documents.json"), "utf8"));
  const catalog = JSON.parse(readFileSync(path.join(root, "catalog.json"), "utf8"));
  return definitions.map(definition => {
    const entry = catalog.templates.find((entry: { id: string }) => entry.id === definition.id);
    const terms = entry.documents.find((document: { role: string }) => document.role === "standard_terms");
    return { ...definition, template: definition.id === "mutual-nda" ? loadTemplate() : {
      introduction: "", clauses: standardSections(readFileSync(path.join(root, terms.path), "utf8")), sourceUrl: terms.source_url,
    } };
  });
}

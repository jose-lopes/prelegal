import { readFileSync } from "node:fs";
import path from "node:path";
import type { Template } from "./nda";

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

import { assembleDocument, validate as validateNda, STATES, type NdaForm, type NdaDocument, type Template } from "./nda";

export type FieldDefinition = {
  id: string; label: string; group: string; type?: string; choices?: string[];
  optional?: boolean; allowNone?: boolean; when?: { field: string; value: string };
};
export type DocumentDefinition = {
  id: string; name: string; description: string; roles: string[]; version: string;
  fields: FieldDefinition[]; instructions: string;
};
export type AgreementTemplate = DocumentDefinition & { template: Template };
export type Draft = Record<string, string>;
export type Drafts = Record<string, Draft>;
export type AgreementDocument = NdaDocument & {
  id: string; title: string; version: string; roles: string[]; subtitle: string;
  signingText: string; attribution: string;
};

export function flattenNda(form: NdaForm): Draft {
  const { party1, party2, ...rest } = form;
  return { ...rest, ...Object.fromEntries([party1, party2].flatMap((party, i) => Object.entries(party).map(([key, value]) => [`party${i + 1}.${key}`, value]))) };
}

export function toNda(fields: Draft): NdaForm {
  const party = (id: string) => ({ company: fields[`${id}.company`] || "", name: fields[`${id}.name`] || "", title: fields[`${id}.title`] || "", address: fields[`${id}.address`] || "" });
  return {
    party1: party("party1"), party2: party("party2"), purpose: fields.purpose || "", effectiveDate: fields.effectiveDate || "",
    termMode: fields.termMode as NdaForm["termMode"], termYears: fields.termYears || "",
    confidentialityMode: fields.confidentialityMode as NdaForm["confidentialityMode"], confidentialityYears: fields.confidentialityYears || "",
    governingLaw: fields.governingLaw || "", jurisdiction: fields.jurisdiction || "", modifications: fields.modifications || "",
  };
}

export function initialDraft(definition: DocumentDefinition): Draft {
  const fields = Object.fromEntries(definition.fields.map(field => [field.id, ""]));
  if (definition.id === "mutual-nda") {
    fields.termMode = "fixed";
    fields.confidentialityMode = "fixed";
  }
  return fields;
}

export function applicable(field: FieldDefinition, draft: Draft) {
  return !field.when || draft[field.when.field] === field.when.value;
}

export function validValue(field: FieldDefinition, value: string) {
  if (!value) return true;
  if (field.choices && !field.choices.includes(value)) return false;
  if (field.type === "date") {
    const parsed = new Date(`${value}T12:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000") && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }
  if (field.type === "years") return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
  if (field.type === "us-state") return STATES.includes(value as typeof STATES[number]);
  if (field.type === "percent") return /^(?:\d+(?:\.\d+)?)%?$/.test(value) && Number(value.replace("%", "")) > 0 && Number(value.replace("%", "")) <= 100;
  return true;
}

export function validateAgreement(definition: DocumentDefinition, draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of definition.fields) {
    if (!applicable(field, draft)) continue;
    const value = draft[field.id] || "";
    if ((!field.optional && !value.trim()) || !validValue(field, value)) errors[field.id] = field.label;
  }
  if (definition.id === "mutual-nda") {
    for (const key of Object.keys(validateNda(toNda(draft)))) errors[key] = definition.fields.find(field => field.id === key)?.label || key;
  }
  return errors;
}

export function assembleAgreement(definition: AgreementTemplate, draft: Draft): AgreementDocument {
  const isNda = definition.id === "mutual-nda";
  const base = isNda ? assembleDocument(toNda(draft), definition.template) : {
    introduction: `This Cover Page identifies the parties and defines the terms below for the Common Paper ${definition.name}. The parties incorporate the Standard Terms included in this document and the documents identified below. Agreed modifications are recorded on this Cover Page.`,
    sourceUrl: definition.template.sourceUrl,
    sections: definition.fields.filter(field => !field.id.startsWith("party") && applicable(field, draft)).map(field => ({
      heading: `${field.group} · ${field.label}`,
      text: draft[field.id]?.trim() || (field.optional ? "None." : `[${field.label} required]`),
    })),
    parties: definition.roles.map((_, i) => Object.fromEntries(["company", "name", "title", "address"].map(key => [key, draft[`party${i + 1}.${key}`] || `[${key} required]`])) as NdaDocument["parties"][number]),
    clauses: definition.template.clauses,
  };
  return { ...base, id: definition.id, title: definition.name, version: definition.version, roles: definition.roles,
    subtitle: "Cover Page", signingText: `By signing this Cover Page, each party agrees to enter into this ${isNda ? "MNDA" : definition.name} as of the Effective Date.`,
    attribution: `Common Paper ${definition.name}${definition.version ? ` (Version ${definition.version})` : ""}, used under CC BY 4.0. Cover Page customized with information entered in Prelegal; Standard Terms unchanged.`,
  };
}

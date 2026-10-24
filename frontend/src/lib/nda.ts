export const PURPOSE = "Evaluating whether to enter into a business relationship with the other party.";
export const STANDARD_URL = "https://commonpaper.com/standards/mutual-nda/1.0/";
export const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

export const STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah",
  "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
] as const;

export type Party = { company: string; name: string; title: string; address: string };
export type NdaForm = {
  party1: Party;
  party2: Party;
  purpose: string;
  effectiveDate: string;
  termMode: "fixed" | "indefinite";
  termYears: string;
  confidentialityMode: "fixed" | "perpetual";
  confidentialityYears: string;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
};
export type Field = Exclude<keyof NdaForm, "party1" | "party2"> | `party${1 | 2}.${keyof Party}`;
export type Errors = Partial<Record<Field, string>>;
export type Section = { heading: string; text: string };
export type Template = { introduction: string; clauses: Section[]; sourceUrl: string };
export type NdaDocument = {
  introduction: string;
  sections: Section[];
  parties: Party[];
  clauses: Section[];
  sourceUrl: string;
};

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function initialForm(): NdaForm {
  return {
    party1: { company: "", name: "", title: "", address: "" },
    party2: { company: "", name: "", title: "", address: "" },
    purpose: PURPOSE, effectiveDate: "", termMode: "fixed", termYears: "1",
    confidentialityMode: "fixed", confidentialityYears: "1", governingLaw: "", jurisdiction: "", modifications: "",
  };
}

export function validate(form: NdaForm): Errors {
  const errors: Errors = {};
  for (const party of ["party1", "party2"] as const) {
    for (const field of ["company", "name", "title", "address"] as const) {
      if (!form[party][field].trim()) errors[`${party}.${field}`] = "This field is required.";
    }
  }
  for (const field of ["purpose", "effectiveDate", "governingLaw", "jurisdiction"] as const) {
    if (!form[field].trim()) errors[field] = "This field is required.";
  }
  if (form.governingLaw && !STATES.includes(form.governingLaw as typeof STATES[number])) {
    errors.governingLaw = "Choose a US state or the District of Columbia.";
  }
  const parsed = new Date(`${form.effectiveDate}T12:00:00Z`);
  if (form.effectiveDate && (!/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveDate) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== form.effectiveDate || form.effectiveDate.startsWith("0000"))) {
    errors.effectiveDate = "Enter a valid date.";
  }
  for (const [active, field] of [[form.termMode === "fixed", "termYears"], [form.confidentialityMode === "fixed", "confidentialityYears"]] as const) {
    if (active && (!/^[1-9]\d*$/.test(form[field]) || !Number.isSafeInteger(Number(form[field])))) {
      errors[field] = "Enter a positive whole number of years.";
    }
  }
  return errors;
}

function value(text: string, label: string) { return text.trim() || `[${label} required]`; }
function years(text: string) { return `${text} ${text === "1" ? "year" : "years"}`; }

export function assembleDocument(form: NdaForm, template: Template): NdaDocument {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(form.effectiveDate) && !validate(form).effectiveDate
    ? new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${form.effectiveDate}T12:00:00Z`))
    : "[Effective date required]";
  return {
    introduction: template.introduction,
    sourceUrl: template.sourceUrl,
    sections: [
      { heading: "Purpose", text: value(form.purpose, "Purpose") },
      { heading: "Effective Date", text: date },
      { heading: "MNDA Term", text: form.termMode === "indefinite" ? "Continues until terminated in accordance with the terms of the MNDA." : `Expires ${value(form.termYears, "Duration")} ${form.termYears === "1" ? "year" : "years"} from Effective Date.` },
      { heading: "Term of Confidentiality", text: form.confidentialityMode === "perpetual" ? "In perpetuity." : `${years(value(form.confidentialityYears, "Duration"))} from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.` },
      { heading: "Governing Law & Jurisdiction", text: `Governing Law: ${value(form.governingLaw, "Governing law")}\nJurisdiction: ${value(form.jurisdiction, "Jurisdiction")}` },
      { heading: "MNDA Modifications", text: form.modifications.trim() || "None." },
    ],
    parties: [form.party1, form.party2].map(p => ({ company: value(p.company, "Company / legal name"), name: value(p.name, "Print name"), title: value(p.title, "Title"), address: value(p.address, "Notice address") })),
    clauses: template.clauses,
  };
}

export const SIGNING_TEXT = "By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.";
export const ATTRIBUTION = "Common Paper Mutual Non-Disclosure Agreement (Version 1.0), used under CC BY 4.0. Cover Page customized with information entered in Prelegal; Standard Terms unchanged.";

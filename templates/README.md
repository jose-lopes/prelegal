# Common Paper template dataset

This one-time snapshot, curated on October 24, 2026 for KAN-5, contains 11 Common
Paper agreements: 11 standard terms documents and the Mutual NDA cover page.
Each agreement directory also retains its upstream README as license evidence.
The documents are unmodified copies, including their original HTML spans,
placeholders, links, and line endings.

## Contents

| Agreement | Documents |
| --- | --- |
| AI Addendum | [Standard terms](AI-Addendum/AI-Addendum.md) |
| Business Associate Agreement | [Standard terms](BAA/BAA.md) |
| Cloud Service Agreement | [Standard terms](CSA/CSA.md) |
| Data Processing Agreement | [Standard terms](DPA/DPA.md) |
| Design Partner Agreement | [Standard terms](Design-Partner-Agreement/design-partner-agreement.md) |
| Mutual Non-Disclosure Agreement | [Standard terms](Mutual-NDA/Mutual-NDA.md), [cover page](Mutual-NDA/Mutual-NDA-coverpage.md) |
| Partnership Agreement | [Standard terms](Partnership-Agreement/Partnership-Agreement.md) |
| Pilot Agreement | [Standard terms](Pilot-Agreement/Pilot-Agreement.md) |
| Professional Services Agreement | [Standard terms](PSA/psa.md) |
| Service Level Agreement | [Standard terms](SLA/sla.md) |
| Software License Agreement | [Standard terms](Software-License-Agreement/Software-License-Agreement.md) |

## Catalog

[catalog.json](catalog.json) is the entry point for future application code.
It contains `schema_version`, `curated_on` (ISO date), and a `templates` array.
Each template has a stable `id`, display `name`, `description`, `language`,
`author`, `license`, `license_url`, `source`, `documents`, and `modifications`.
The `source` records the upstream repository and exact commit, plus the local
path and upstream URL of the README containing the license declaration.

Each document has a `role` (`standard_terms` or `cover_page`), local `path`,
immutable `source_url`, upstream `git_blob_sha1`, and a `sha256` of its exact
UTF-8 bytes. All local catalog paths are relative to this directory. Upstream
README files are supporting documentation and are not agreement documents.

Resolve a document's `path` under `templates/` to load its Markdown. Use the
document roles to keep the NDA cover page and standard terms together. Preserve
the source snapshot when producing customized copies and record changes to any
redistributed adaptations. Do not assume all highlighted terms are interchangeable
placeholders: the upstream documents include HTML markup and cross-references.

## Curation and scope

The source is [Common Paper's public GitHub organization](https://github.com/CommonPaper).
The snapshot includes all 11 public agreement repositories found during curation;
software, plugins, hiring exercises, and forks were excluded. Only agreement
Markdown and the repositories' README files were copied, excluding build and
lint configuration. Each file was fetched at the commit recorded in the catalog
and its bytes verified against the upstream Git blob hash.

The catalog records source commits rather than assuming the upstream README's
version is current. Some READMEs describe version 1 while their agreement files
contain later versions. No documents were rewritten to reconcile this.

Most repositories provide standard terms only and refer to cover pages, order
forms, statements of work, or other attachments supplied separately. Only the
Mutual NDA repository includes a Markdown cover page. This dataset contains the
Markdown actually available upstream; those additional forms are not included.
The SLA is intended to accompany the Cloud Service Agreement, and the AI Addendum
supplements an underlying agreement.

## License

The Common Paper documents are licensed under [CC BY 4.0](LICENSE). The license
notice links to the full legal code and explains attribution and change notices.
Pinned source and license-declaration links are available for every catalog entry.

# Prelegal Project

## Overview

This project is building a SaaS product for drafting legal agreements from the templates directory. AI chat fills document-specific fields, with picker and chat-based document selection.
The dataset contains 11 document types, cataloged here:

@templates/catalog.json

The UI supports all 11 catalog types through a free-form AI chat, live preview, and PDF download. Real authentication and document persistence are not implemented.

## Development process

When instructed to build a feature:

1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

After each completed step, update the current status in this `AGENTS.md`. Record what is implemented, validation results, remaining work, and PR/Jira status as applicable. Keep the overview and technical design consistent with the implementation; mark work complete only after it is verified.

## AI design

Use the Go LiteLLM SDK (`github.com/voocel/litellm`) via OpenRouter with `nvidia/nemotron-3-ultra-550b-a55b:free` and NVIDIA as the inference provider, as requested for KAN-8. Use structured function calls with the strict `update_document` schema generated from `backend/documents.json`; this endpoint supports tools but not `response_format`. Validate results before populating the cover page. Keep the standard clauses unchanged and the API key server-side.

There is an OPENROUTER_PM_API_KEY as environment variable.

## Technical design

Docker Compose runs one non-root application container. The Go backend in `backend/` serves the statically exported Next.js frontend from `frontend/` and the API on port 8000.

SQLite runs inside the Go process. Each backend startup creates a fresh database in temporary storage with an empty `users` table (`id`, unique `email`, `created_at`). The current UI does not write users or agreements to it.

`POST /api/chat` sends the conversation, active document ID, and separate session drafts to OpenRouter/NVIDIA and returns a reply, selected document ID, optional suggested alternative, and the selected document’s complete field entries. Chat and agreement state stay in React memory; Prelegal does not persist them. The API key stays on the server.

Use `make start`, `make stop`, `make logs`, and `make test`. Application available at http://localhost:8000. Optional frontend hot reload is available through the Compose `dev` profile on port 3000.

## Color Scheme

Use these colors for new UI. The demo login and AI chat builder follow this palette.

- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

## Implemented status (through KAN-9)

- KAN-8 delivery: implementation and validation complete; [PR #6](https://github.com/jose-lopes/prelegal/pull/6) merged into `main`; [KAN-8](https://josemslopes.atlassian.net/browse/KAN-8) marked Done in Jira.
- Common Paper dataset: 11 agreement types with source revisions, checksums, and license attribution.
- Agreement builder: all 11 catalog types through picker/chat selection, separate in-memory drafts, structured field extraction/corrections, conditional required inputs, live preview, and full browser-generated PDFs with blank signatures, unchanged standard terms, and source attribution. Unsupported requests offer a supported alternative for acceptance.
- Demo login: **Continue** opens the builder without credentials. Entry state and agreement inputs stay in React memory; reload returns to login and clears inputs.
- V1 foundation: Docker/Make workflow, temporary SQLite, graceful shutdown, and `GET /api/health` checking database availability.
- Validation: Go race tests, frontend lint/unit/type/build checks, Chromium integration tests covering chat, login, mobile layout, API routes, PDF contents, and retry; opt-in live AI integration with synthetic data.

## KAN-9 progress

- Requirements read from [KAN-9](https://josemslopes.atlassian.net/browse/KAN-9): support all 11 catalog types and offer supported alternatives for unsupported requests.
- Agreed behavior: picker plus chat selection; separate in-memory drafts; complete template inputs; external text/references through chat, without uploads.
- All 11 shared definitions, picker/chat selection, separate drafts, conditional inputs, literal-text preview, and complete PDF assembly implemented. Source snapshots unchanged; registry coverage/source-fidelity tests pass.
- Validation complete: `make test` passed, including Go race tests, 59 frontend tests, lint/build/type checks, and 23 Chromium tests. Every document PDF was checked for complete clauses/definitions, party data, attribution, and visible footers; mobile selection across all types and failure/retry regressions passed.
- Live synthetic validation passed: NDA extraction/correction and AI Addendum → unsupported employment request → accepted Professional Services Agreement.
- PDF pagination fixes verified: body-only line height prevents dynamic-footer coordinate overflow; signature fields in page flow preserve both parties across page breaks. Source template checksums remain unchanged.
- KAN-9 delivery complete: [PR #8](https://github.com/jose-lopes/prelegal/pull/8) merged into `main` (merge commit `61aa43e`); [KAN-9](https://josemslopes.atlassian.net/browse/KAN-9) marked Done (Concluído), with resolution Done. Workspace switched to `main` and updated to the merged changes.

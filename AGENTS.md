# Prelegal Project

## KAN-10 progress

- Requirements read from [KAN-10](https://josemslopes.atlassian.net/browse/KAN-10); Jira moved to In Progress (Em andamento).
- Scope: real email/password registration and sign-in, private saved document history and reopening, polished responsive screens, and draft/legal-review disclaimers in the UI and PDFs. Accounts, sessions, and saved documents reset on server restart.
- Implemented registration/sign-in with salted PBKDF2 password hashes, expiring HttpOnly cookie sessions, sign-out/revocation, cross-origin protection, and authenticated chat. SQLite stores users, hashed sessions, and private agreement fields/titles/timestamps; every startup still starts fresh.
- Implemented responsive account screens, private document library, partial-draft saving, reopening/updating, automatic saving before PDF downloads, and shared draft/legal-review disclaimers in the UI and PDF cover page. Chat and unsaved changes remain in browser memory.
- Implementation and validation complete: `make test` passed with Go race tests, frontend lint/build/type checks, 59 frontend unit tests, and 27 Chromium tests. Coverage includes authentication, expiry/revocation, TLS cookies, Unicode passwords, cross-origin rejection, private document access, concurrent saves, restart reset, save/reopen/update, retries, mobile layouts, and complete PDFs with the disclaimer across all 11 types. Desktop/mobile screenshots reviewed; source templates unchanged.
- PR submission pending on `feat/kan-10-accounts-documents`; Jira remains In Progress (Em andamento).

## Overview

This project is building a SaaS product for drafting legal agreements from the templates directory. AI chat fills document-specific fields, with picker and chat-based document selection.
The dataset contains 11 document types, cataloged here:

@templates/catalog.json

The UI supports all 11 catalog types through a free-form AI chat, live preview, and PDF download. Email/password accounts have private saved-document libraries; accounts, sessions, and saved drafts last until the server restarts. All documents are drafts subject to legal review.

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

SQLite runs inside the Go process. Each backend startup creates a fresh database in temporary storage with `users` (unique email, salted password hash), `sessions` (hashed tokens and expiry), and `agreements` (owner, template ID, title, fields, timestamps). Passwords use standard-library PBKDF2-HMAC-SHA256 with 600,000 iterations and random salts. Session cookies are HttpOnly, SameSite=Lax, Secure for TLS requests, and expire after seven days. Sign-out revokes the current session. Go cross-origin protection covers state-changing routes. SQLite access is serialized through one connection.

Authenticated `POST /api/chat` sends the conversation, active document ID, and separate session drafts to OpenRouter/NVIDIA and returns a reply, selected document ID, optional suggested alternative, and the selected document’s complete field entries. Chat and unsaved state stay in React memory. `POST /api/auth/signup`, `/signin`, `/signout` and `GET /api/auth/session` handle accounts and sessions. Authenticated `GET/POST /api/agreements` and `GET/PUT /api/agreements/{id}` provide owner-scoped document history and saving. Save draft persists partial fields; PDF download saves before rendering. Reopening restores saved fields with a fresh chat. The API key stays on the server.

Use `make start`, `make stop`, `make logs`, and `make test`. Application available at http://localhost:8000. Optional frontend hot reload is available through the Compose `dev` profile on port 3000.

## Color Scheme

Use these colors for new UI. Account screens, the document library, and the AI chat builder follow this palette.

- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

## Implemented status (through KAN-10)

- KAN-8 delivery: implementation and validation complete; [PR #6](https://github.com/jose-lopes/prelegal/pull/6) merged into `main`; [KAN-8](https://josemslopes.atlassian.net/browse/KAN-8) marked Done in Jira.
- Common Paper dataset: 11 agreement types with source revisions, checksums, and license attribution.
- Agreement builder: all 11 catalog types through picker/chat selection, separate in-memory drafts, structured field extraction/corrections, conditional required inputs, live preview, and full browser-generated PDFs with blank signatures, unchanged standard terms, and source attribution. Unsupported requests offer a supported alternative for acceptance.
- KAN-10 replaces demo entry with email/password accounts and a private saved-document library. Reload restores the session and opens the library; unsaved changes and chat messages clear.
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

# Prelegal Project

## Overview

Prelegal is a SaaS prototype for drafting legal agreements from Common Paper templates. Users register or sign in, choose a document through a picker or AI chat, fill its fields conversationally, review a live preview, and save or download their draft.

All 11 document types in the dataset are supported:

@templates/catalog.json

Each account has a private saved-document library. Accounts, sessions, and saved documents last until the backend restarts. Documents are drafts subject to legal review; the UI and PDF cover pages disclose this, and Prelegal does not provide legal advice.

## Current status

Implementation through KAN-10 is complete and merged into `main`. No work remains pending for the deliveries below.

| Delivery | Status | Pull request |
| --- | --- | --- |
| [KAN-8](https://josemslopes.atlassian.net/browse/KAN-8): AI drafting foundation | Done | [PR #6](https://github.com/jose-lopes/prelegal/pull/6), merged |
| [KAN-9](https://josemslopes.atlassian.net/browse/KAN-9): all 11 document types and supported alternatives | Done | [PR #8](https://github.com/jose-lopes/prelegal/pull/8), merged (`61aa43e`) |
| [KAN-10](https://josemslopes.atlassian.net/browse/KAN-10): accounts, private document history, UI polish, and draft disclaimers | Done | [PR #9](https://github.com/jose-lopes/prelegal/pull/9), merged (`00bb3fe`) |

KAN-10 is Done (Concluído), with resolution Done. The workspace is on `main` with the merged implementation.

## Implemented behavior

- Email/password registration and sign-in replace the former demo entry screen. Reload restores a valid session and opens the document library. Sign-out revokes the current session and clears the account UI.
- All 11 agreement types support picker/chat selection, separate in-memory drafts by type, structured field extraction and corrections, conditional required inputs, and live preview. Unsupported requests offer a supported alternative and wait for acceptance before switching.
- **Save draft** stores the selected document's title and fields, including partial drafts. New agreements create separate library entries, including multiple documents of the same type. Reopening restores saved fields with a fresh chat; subsequent saves update that entry.
- **Download PDF** saves the current document before generating the PDF in the browser. PDFs include populated cover pages/details, complete unchanged standard terms, blank signatures/signing dates, source attribution, and the draft/legal-review disclaimer.
- Common Paper source snapshots retain their revisions, checksums, and CC BY 4.0 attribution. User text is rendered literally in previews and PDFs.

## Development process

When instructed to build a feature:

1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

After each completed step, update the current status in this `AGENTS.md`. Record what is implemented, validation results, remaining work, and PR/Jira status as applicable. Keep the overview and technical design consistent with the implementation; mark work complete only after it is verified.

## Technical design

Docker Compose runs one non-root application container. The Go backend in `backend/` serves the statically exported Next.js frontend from `frontend/` and the API on port 8000. SQLite runs inside the Go process; shutdown drains HTTP requests, closes the database, and removes its temporary directory.

Each backend startup creates a fresh database in temporary storage with:

- `users`: ID, unique normalized email, salted password hash, and creation timestamp.
- `sessions`: hashed session token, user ID, and expiry.
- `agreements`: ID, owner ID, template ID, title, fields, and creation/update timestamps.

SQLite access uses one connection to serialize writes. Passwords use standard-library PBKDF2-HMAC-SHA256 with 600,000 iterations and random salts; passwords must contain 12–128 characters. Session cookies are HttpOnly, SameSite=Lax, Secure for TLS requests, and expire after seven days. Sign-out revokes the current token. Go cross-origin protection covers state-changing routes, and saved-document reads and updates are scoped to the authenticated owner. API responses use `Cache-Control: no-store`.

| API | Purpose |
| --- | --- |
| `GET /api/health` | Check database availability |
| `POST /api/auth/signup` | Register and start a session |
| `POST /api/auth/signin` | Sign in and start a session |
| `POST /api/auth/signout` | Revoke the current session |
| `GET /api/auth/session` | Read the authenticated account |
| `POST /api/chat` | Generate a validated document update; authentication required |
| `GET/POST /api/agreements` | List or create the authenticated user's saved documents |
| `GET/PUT /api/agreements/{id}` | Read or update an owned document |

Document saves accept `{documentId, title, fields}` and validate fields against `backend/documents.json`. Chat sends `{messages, documentId, drafts}` and returns `{reply, documentId, suggestedDocumentId, fields}`; returned fields are the selected document's complete ordered entries.

## AI design

Use the Go LiteLLM SDK (`github.com/voocel/litellm`) via OpenRouter with `nvidia/nemotron-3-ultra-550b-a55b:free` and NVIDIA as the inference provider, as requested for KAN-8. Use structured function calls with the strict `update_document` schema generated from `backend/documents.json`; this endpoint supports tools but not `response_format`. Validate results before populating the cover page. Keep the standard clauses unchanged and the API key server-side.

Configure `OPENROUTER_PM_API_KEY` on the server. Without it, authenticated chat returns 503 while accounts, saved documents, previews, downloads, and health checks remain available. AI calls time out after 60 seconds; failed updates preserve the draft and unsent message for retry.

## Data lifecycle and prototype limits

- Restarting or recreating the backend clears all accounts, sessions, and saved documents. Download PDFs to retain a lasting copy; the account screens and library explain this limit.
- Chat messages, unsaved changes, and separate drafts by type stay in React memory and clear on reload. Only explicitly saved documents and documents saved during download are stored in SQLite. PDF files are generated in the browser and are not stored on the server.
- Chat and draft details are sent to OpenRouter/NVIDIA for AI processing. The API key stays on the server; agreement data and authentication tokens are not stored in localStorage or sessionStorage.
- External agreements and policies can be supplied as chat text or references. Uploads, automatic retrieval/verification, and electronic signing are not implemented. Signatures and signing dates remain blank.

## Development and validation

Use `make start`, `make stop`, `make logs`, and `make test`. The application is available at http://localhost:8000; Compose binds it to host loopback. `APP_PORT` overrides the host port. Optional frontend hot reload uses the Compose `dev` profile on port 3000, with `FRONTEND_PORT` as an override.

The last full validation, completed for KAN-10 before merge, passed `make test`: Go race tests, frontend lint/build/type checks, 59 frontend unit tests, and 27 Chromium integration tests. Coverage includes authentication, expiry/revocation, TLS cookies, Unicode passwords, cross-origin rejection, owner isolation, concurrent saves, restart reset, save/reopen/update, failure/retry, mobile layouts, and complete PDF content plus disclaimers for all 11 types. Desktop/mobile screenshots were reviewed; source templates remained unchanged.

Automated browser tests mock the AI API. Earlier KAN-9 live validation passed using synthetic NDA extraction/correction and an unsupported request followed by acceptance of a supported alternative. Live AI tests remain opt-in through `PRELEGAL_LIVE_AI=1`; use synthetic data.

## Color scheme

Use these colors for new UI. Account screens, the document library, and the AI chat builder follow this palette.

- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

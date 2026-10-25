# Prelegal Project

## Overview

This project is building a SaaS product for drafting legal agreements from the templates directory. AI chat fills the Mutual NDA cover page; document selection is not implemented.
The dataset contains 11 document types, cataloged here:

@templates/catalog.json

The current UI supports only the Mutual NDA through a free-form AI chat, live preview, and PDF download. Real authentication and document persistence are not implemented.

## Development process

When instructed to build a feature:

1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

After each completed step, update the current status in this `AGENTS.md`. Record what is implemented, validation results, remaining work, and PR/Jira status as applicable. Keep the overview and technical design consistent with the implementation; mark work complete only after it is verified.

## AI design

Use the Go LiteLLM SDK (`github.com/voocel/litellm`) via OpenRouter with `nvidia/nemotron-3-ultra-550b-a55b:free` and NVIDIA as the inference provider, as requested for KAN-8. Use structured function calls with the strict `update_nda` schema; this endpoint supports tools but not `response_format`. Validate results before populating the cover page. Keep the standard clauses unchanged and the API key server-side.

There is an OPENROUTER_PM_API_KEY as environment variable.

## Technical design

Docker Compose runs one non-root application container. The Go backend in `backend/` serves the statically exported Next.js frontend from `frontend/` and the API on port 8000.

SQLite runs inside the Go process. Each backend startup creates a fresh database in temporary storage with an empty `users` table (`id`, unique `email`, `created_at`). The current UI does not write users or agreements to it.

`POST /api/chat` sends the conversation and current NDA fields to OpenRouter/NVIDIA and returns a reply and updated fields. Chat and agreement state stay in React memory; Prelegal does not persist them. The API key stays on the server.

Use `make start`, `make stop`, `make logs`, and `make test`. Application available at http://localhost:8000. Optional frontend hot reload is available through the Compose `dev` profile on port 3000.

## Color Scheme

Use these colors for new UI. The demo login and AI chat builder follow this palette.

- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

## Implemented status (through KAN-8)

- KAN-8 delivery: implementation and validation complete; [PR #6](https://github.com/jose-lopes/prelegal/pull/6) merged into `main`; [KAN-8](https://josemslopes.atlassian.net/browse/KAN-8) marked Done in Jira.
- Common Paper dataset: 11 agreement types with source revisions, checksums, and license attribution.
- Mutual NDA builder: free-form AI conversation, structured field extraction and corrections, required-field validation, live preview, and browser-generated PDF with cover page, blank signature fields, and all 11 standard clauses.
- Demo login: **Continue** opens the builder without credentials. Entry state and agreement inputs stay in React memory; reload returns to login and clears inputs.
- V1 foundation: Docker/Make workflow, temporary SQLite, graceful shutdown, and `GET /api/health` checking database availability.
- Validation: Go race tests, frontend lint/unit/type/build checks, Chromium integration tests covering chat, login, mobile layout, API routes, PDF contents, and retry; opt-in live AI integration with synthetic data.

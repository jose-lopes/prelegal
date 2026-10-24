# Prelegal Project

## Overview

This project is building a SaaS product for drafting legal agreements from the templates directory. AI chat for selecting documents and filling fields is planned, but not implemented.
The dataset contains 11 document types, cataloged here:

@templates/catalog.json

The current UI supports only the Mutual NDA through a manual form. Real authentication and document persistence are not implemented.

## Development process

When instructed to build a feature:

1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `nvidia/nemotron-3-ultra-550b-a55b:free` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_PM_API_KEY as environment variable.

## Technical design

Docker Compose runs one non-root application container. The Go backend in `backend/` serves the statically exported Next.js frontend from `frontend/` and the API on port 8000.

SQLite runs inside the Go process. Each backend startup creates a fresh database in temporary storage with an empty `users` table (`id`, unique `email`, `created_at`). The current UI does not write users or agreements to it.

Use `make start`, `make stop`, `make logs`, and `make test`. Application available at http://localhost:8000. Optional frontend hot reload is available through the Compose `dev` profile on port 3000.

## Color Scheme

Use these colors for new UI. The demo login follows this palette; the existing NDA builder retains its prototype styling.

- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

## Implemented status (through KAN-7)

- Common Paper dataset: 11 agreement types with source revisions, checksums, and license attribution.
- Mutual NDA builder: required-field validation, live preview, and browser-generated PDF with cover page, blank signature fields, and all 11 standard clauses.
- Demo login: **Continue** opens the builder without credentials. Entry state and agreement inputs stay in React memory; reload returns to login and clears inputs.
- V1 foundation: Docker/Make workflow, temporary SQLite, graceful shutdown, and `GET /api/health` checking database availability.
- Validation: Go race tests, frontend lint/unit/type/build checks, and Chromium integration tests covering login, mobile layout, API routes, PDF contents, and download retry.

# prelegal

A platform for drafting common legal agreements.

## AI drafting (KAN-9)

The [Next.js frontend](frontend/README.md) lets you chat with an AI to fill in a
Common Paper agreement, preview the completed document, and download a PDF.
All 11 catalog types are supported through a picker or chat. Unsupported requests
receive a supported alternative for the user to accept before switching. Each
document type keeps its own draft in session memory. The assistant asks for missing details and accepts corrections
in any order. A demo
login screen opens the builder with **Continue**. There is no authentication.
Chat and agreement details are sent to OpenRouter/NVIDIA to process each message.
Prelegal keeps them in browser memory without saving them; reloading clears them
and returns to the login screen. The standard clauses remain unchanged.

Docker Engine, Docker Compose, and Make are the only host requirements. From the
repository root:

```sh
export OPENROUTER_PM_API_KEY=... # Server-side key; never included in the frontend
make start  # Build, start, and wait for health
make logs   # Follow application logs
make test   # Go race tests, frontend checks, and browser integration tests
make stop  # Stop and remove containers; retain development dependency caches
```

Open <http://localhost:8000>. Set `APP_PORT=8001 make start` to use another local
port. The first build downloads dependencies. `make test` starts the application
for browser tests and leaves it running; use `make stop` afterward.

### Runtime

A multistage Docker build exports Next.js to static files and compiles the Go
backend in `backend/`. One non-root application container serves the UI, bundled
fonts, and API on port 8000. `GET /api/health` checks the SQLite connection and
returns `200 {"status":"ok"}` or `503 {"status":"unavailable"}`.

`POST /api/chat` accepts `{messages, documentId, drafts}` and returns
`{reply, documentId, suggestedDocumentId, fields}`. Drafts are keyed by catalog ID;
`fields` contains the selected document’s complete `{id, value}` entries. Empty
document IDs represent the initial unselected state. The Go
LiteLLM SDK calls `nvidia/nemotron-3-ultra-550b-a55b:free` through OpenRouter,
routed only to NVIDIA. A forced `update_document` function call carries a strict JSON
schema because this endpoint supports tools but not `response_format`. The server
validates updates, limits request size and message count, and times out AI calls
after 60 seconds. Failures preserve the last draft and the unsent message for retry.
With no API key, chat returns 503 while the UI and health check remain available.
The model and provider must support [schema-based tool calling](https://openrouter.ai/docs/api-reference/overview).

SQLite runs within the Go process. Every backend startup creates a fresh database
in temporary container storage and initializes an empty `users` table (`id`,
unique `email`, `created_at`). Restarting or recreating the container resets the
database. No users or agreement details are written by the current UI. Shutdown
drains HTTP requests, closes the database, and removes its temporary directory.

See the frontend README for optional hot-reload development, browser tests, and
dependency maintenance. Real accounts and saved drafts are future work.
External agreements and policies are supplied as chat text or identifying
references; Prelegal does not upload, fetch, or verify them.

`backend/documents.json` defines document fields and conditional requirements for
both the Go server and frontend build. Source templates remain unchanged.

Automated tests mock the AI service. To run the optional live integration test
with synthetic data and your configured key:

```sh
cd backend
PRELEGAL_LIVE_AI=1 go test -run TestLiveChat -v
```

## Template dataset

The [templates directory](templates/README.md) contains Common Paper agreement
templates and a JSON catalog with descriptions, source revisions, and checksums.
These third-party documents are licensed under
[CC BY 4.0](templates/LICENSE), separately from this project's MIT license.

## Project status

The project is currently in progress and is scheduled for completion in one week,
on October 31, 2026.

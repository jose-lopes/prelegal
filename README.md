# prelegal

A platform for drafting common legal agreements.

## Accounts and AI drafting (KAN-10)

The [Next.js frontend](frontend/README.md) lets you chat with an AI to fill in a
Common Paper agreement, preview the completed document, and download a PDF.
All 11 catalog types are supported through a picker or chat. Unsupported requests
receive a supported alternative for the user to accept before switching. Each
document type keeps its own draft in session memory. The assistant asks for missing details and accepts corrections
in any order. Register with an email and a password of 12–128 characters, then
sign in to your private document library. Create an agreement, use **Save draft**
to keep partial work, or **Download PDF** to save and download a completed draft.
Open a saved document to review, correct, and download it again. Each new agreement
creates its own saved entry, including multiple agreements of the same type.

Accounts, sessions, and saved documents last until the server restarts. The UI
explains this limit; download PDFs to retain a lasting copy. Chat messages and
unsaved changes remain in browser memory and clear on reload. Chat and draft
details are sent to OpenRouter/NVIDIA to process each message. Standard clauses
remain unchanged. All screens and PDF cover pages identify the documents as drafts
subject to legal review; Prelegal does not provide legal advice.

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

Authenticated `POST /api/chat` accepts `{messages, documentId, drafts}` and returns
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
in temporary container storage with users, sessions, and agreements. Restarting or
recreating the container resets all accounts and documents. Shutdown drains HTTP
requests, closes the database, and removes its temporary directory.

Passwords use the Go standard library's PBKDF2-HMAC-SHA256 with 600,000 iterations
and a random salt. Sessions use random tokens whose hashes are stored server-side;
cookies are HttpOnly, SameSite=Lax, Secure on TLS connections, and expire after seven
days. Sign-out revokes the active token. State-changing routes use Go's cross-origin
protection, and all saved-document reads and updates require the owning account.
The supplied Compose deployment binds HTTP to localhost.

Account routes: `POST /api/auth/signup`, `POST /api/auth/signin`,
`POST /api/auth/signout`, and `GET /api/auth/session`. Authenticated document routes:
`GET/POST /api/agreements` and `GET/PUT /api/agreements/{id}`. Saves accept
`{documentId, title, fields}`; the server validates fields against the shared
registry. A download saves before rendering; reopening restores fields with a new
chat. PDF files are generated in the browser rather than stored in the database.

See the frontend README for optional hot-reload development, browser tests, and
dependency maintenance.
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

# Prelegal frontend

Next.js App Router and TypeScript frontend, statically exported for the Go runtime
with AI drafting in [KAN-9](https://josemslopes.atlassian.net/browse/KAN-9). Select
**Continue** on the demo login screen to enter the builder; no credentials or
account are required. Choose any of the 11 catalog types in the picker or describe
what you need in chat. The assistant collects document-specific details and accepts
corrections. Unsupported requests receive an alternative for the user to accept.
Switching types restores that type's draft without copying terms from another.
Review the live preview and download a selectable-text PDF with populated cover
page/details, blank signature/date lines, all standard terms, and attribution.

## Docker Compose

Run all commands from the repository root. Make, Docker Engine, and Docker Compose are
the only host requirements. Node.js, npm, dependencies, and test browsers run in
containers. The first build needs internet access to download them.

```sh
export OPENROUTER_PM_API_KEY=...
make start
```

Open <http://localhost:8000>. Go serves both the API and exported frontend. Rebuild
with `make start` after source changes. The server binds to host loopback only;
use `APP_PORT=8001 make start` to select a different local port.

For optional frontend hot reload, run
`docker compose --profile dev up --build frontend` and open
<http://localhost:3000>. Use `FRONTEND_PORT=3001` for another local port.
Dependencies and Next.js output use named volumes; templates are mounted read-only.
The development server proxies `/api/*` to the Go application. Host development
uses `http://127.0.0.1:8000` by default; set `API_PROXY_URL` to change it.

```sh
# Lint, unit tests, production build, and TypeScript checks
docker compose --profile test run --build --rm checks

# Browser tests against the Go-served app with container-installed Chromium
docker compose --profile test run --build --rm e2e

# Stop this project's containers and network, retaining dependency caches
make stop
```

The test image installs Chromium and its Linux libraries. Compose builds and starts
the application dependency and waits for its health check before browser tests.
Chat integration tests mock the AI API to cover follow-up questions, partial drafts,
corrections, pending requests, failures and retry without external calls.
Downloaded PDFs are parsed to verify selectable text, completed values, standard
terms, and attribution. Tests also cover demo entry, reload reset, mobile layout,
and API/static routing. Screenshots/traces remain inside the test container; omit
`--rm` and use `docker compose cp` to retain them for review. `make test` runs all
frontend checks, Go race tests, and browser tests.

## Dependencies and local commands

The committed `package-lock.json` pins dependencies. To update it without host npm:

```sh
docker compose run --rm tooling install --package-lock-only
docker compose run --rm tooling audit
```

The tooling service writes as UID/GID 1000 by default. Set `LOCAL_UID` and
`LOCAL_GID` to match your user if different. After changing dependencies, stop
development, rebuild, and synchronize its dependency volume:

```sh
docker compose --profile dev stop frontend
docker compose --profile dev build frontend
docker compose --profile dev run --rm frontend npm ci
docker compose --profile dev up frontend
```

For optional host development, use Node.js 22.13+ and run `npm ci` in `frontend/`.
Scripts are `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`,
`npm test`, and `npm run test:e2e`. `npm run build` produces `out/`; the Go server
serves that directory. `next start` is not used for static exports. Host browser
tests default to the running application at `http://127.0.0.1:8000`; override with
`PLAYWRIGHT_BASE_URL`. For host browser tests also run
`npx playwright install --with-deps chromium`.

## Data and templates

Chat messages, agreement data and demo entry stay in React memory. Each message
sends the conversation, active document ID, and separate session drafts to the Go backend, which calls
OpenRouter with the NVIDIA Nemotron model. The API key stays on the server. The
UI discloses AI processing before the first message. There are no accounts, saved
drafts, cookies or analytics. Prelegal does not persist or log chat or agreement
content. Reloading clears the session and returns to demo login. The SQLite
users table remains unused by the UI. PDF generation runs in the browser, with a
lazily loaded renderer and bundled Noto Sans fonts; see
[font provenance and license](public/fonts/README.md).

The build reads all catalog entries in `../templates/catalog.json` and the shared
field registry in `../backend/documents.json`. Build from the whole repository, as
the Compose configuration does. Go embeds the registry for runtime validation and
strict AI function calls. Preview and PDF share the assembled document model.
Standard terms retain all clauses, nested lists, definitions and references.
Source Markdown is unchanged. User input is rendered as literal text.

The Common Paper templates are used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Generated PDFs identify customized cover pages, unchanged terms, license, and
pinned source. Versions are displayed only when identified by the source template.
See the [dataset documentation](../templates/README.md).

## Prototype limits

Documents are in English. Each type has its own required inputs and conditional
terms; the Mutual NDA retains US-state governing law and positive whole-year
fixed durations. Other document types collect their own law and duration details.
Dates and commercial/legal choices come from the user. External agreements and
policies can be provided as text or references; there are no uploads or automatic
retrieval/verification. Signatures and signing dates remain blank for execution
outside the app. The prototype does not recommend legal terms or provide electronic
signing. Bundled fonts cover Latin, Greek and Cyrillic; other scripts require
additional fonts.

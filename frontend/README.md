# Prelegal frontend

Next.js App Router and TypeScript prototype for [KAN-6](https://josemslopes.atlassian.net/browse/KAN-6).
Complete both parties' details, purpose, timing, governing US state, court location,
and optional modifications. Review the live agreement and download a selectable-text
PDF with the cover page, blank signature/date lines, all 11 standard clauses, and
source/license attribution.

## Docker Compose

Run all commands from the repository root. Docker Engine and Docker Compose are
the only host requirements. Node.js, npm, dependencies, and test browsers run in
containers. The first build needs internet access to download them.

```sh
docker compose up --build frontend
```

Open <http://localhost:3000>. Source edits reload automatically. The server binds
to host loopback only; use `FRONTEND_PORT=3001 docker compose up --build frontend`
to select a different local port. Dependencies and Next.js output use named volumes,
while the shared template dataset is mounted read-only.

```sh
# Lint, unit tests, production build, and TypeScript checks
docker compose --profile test run --build --rm checks

# Production-server browser tests with container-installed Chromium
docker compose --profile test run --build --rm e2e

# Stop this project's containers and network, retaining dependency caches
docker compose down
```

The test image installs Chromium and its Linux libraries. Browser tests start
their own production server inside the container and do not need the development
service running. Downloaded PDFs are parsed to verify selectable text, completed
values, standard terms, and attribution. Screenshots/traces remain inside the
test container; omit `--rm` and use `docker compose cp` to retain them for review.

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
docker compose stop frontend
docker compose build frontend
docker compose run --rm frontend npm ci
docker compose up frontend
```

For optional host development, use Node.js 22.13+ and run `npm ci` in `frontend/`.
Scripts are `npm run dev`, `npm run build`, `npm start`, `npm run lint`,
`npm run typecheck`, `npm test`, and `npm run test:e2e`. Run a production build
before browser tests. For host browser tests also run `npx playwright install --with-deps chromium`.

## Data and templates

Form data stays in React memory. There are no application APIs, accounts, database,
saved drafts, cookies, analytics, or submissions of agreement details. Reloading
clears the form. PDF generation runs in the browser, with a lazily loaded renderer
and bundled Noto Sans fonts; see [font provenance and license](public/fonts/README.md).

The build reads the `mutual-nda` catalog entry in `../templates/catalog.json` and
loads its cover page and standard terms. Build from the whole repository, as the
Compose configuration does. Runtime document generation uses a shared model for
HTML and PDF. It fills the cover page and retains the standard terms' text,
including defined-term references. Source Markdown is never modified. User input
is rendered as literal text, never HTML or Markdown. No legal text is AI-generated.

The documents are Common Paper Mutual NDA v1.0 under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Generated PDFs identify the customized cover page, unchanged standard terms,
license, and pinned upstream source. See the [dataset documentation](../templates/README.md).

## Prototype limits

English documents using US-state governing law. Fixed terms are positive whole
years measured from the effective date, or users can select indefinite/perpetual
terms. The date initially uses the browser's local calendar day. Signatures and
signing dates remain blank for execution outside this app. This prototype does
not recommend legal terms, provide electronic signing, or support other agreement
types. Bundled fonts cover Latin, Greek, and Cyrillic, including accented names;
scripts outside that coverage require additional fonts.

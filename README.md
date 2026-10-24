# prelegal

A platform for drafting common legal agreements.

## V1 foundation (KAN-7)

The [Next.js frontend](frontend/README.md) lets you fill in a Common Paper Mutual
NDA, preview the completed agreement, and download a ready-to-sign PDF. A demo
login screen opens the builder with **Continue**. There is no authentication.
Agreement details stay in browser memory; reloading clears them and returns to
the login screen.

Docker Engine, Docker Compose, and Make are the only host requirements. From the
repository root:

```sh
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

SQLite runs within the Go process. Every backend startup creates a fresh database
in temporary container storage and initializes an empty `users` table (`id`,
unique `email`, `created_at`). Restarting or recreating the container resets the
database. No users or agreement details are written by the current UI. Shutdown
drains HTTP requests, closes the database, and removes its temporary directory.

See the frontend README for optional hot-reload development, browser tests, and
dependency maintenance. Real accounts, saved drafts, AI chat, and additional
document types are future work.

## Template dataset

The [templates directory](templates/README.md) contains Common Paper agreement
templates and a JSON catalog with descriptions, source revisions, and checksums.
These third-party documents are licensed under
[CC BY 4.0](templates/LICENSE), separately from this project's MIT license.

## Project status

The project is currently in progress and is scheduled for completion in one week,
on October 31, 2026.

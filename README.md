# prelegal

A platform for drafting common legal agreements.

## Mutual NDA prototype (KAN-6)

The [Next.js application](frontend/README.md) lets you fill in a Common Paper
Mutual NDA, preview the completed agreement, and download a ready-to-sign PDF.
Details stay in browser memory and are cleared on reload.

Start the development environment with Docker Compose (no host Node.js needed):

```sh
docker compose up --build frontend
```

Open <http://localhost:3000>. See the frontend README for containerized checks,
browser tests, and dependency maintenance.

## Template dataset

The [templates directory](templates/README.md) contains Common Paper agreement
templates and a JSON catalog with descriptions, source revisions, and checksums.
These third-party documents are licensed under
[CC BY 4.0](templates/LICENSE), separately from this project's MIT license.

## Project status

The project is currently in progress and is scheduled for completion in one week,
on October 31, 2026.

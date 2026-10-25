FROM node:22-bookworm-slim AS frontend-dependencies
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/frontend
RUN chown node:node /app/frontend
COPY --chown=node:node frontend/package.json frontend/package-lock.json ./
USER node
RUN npm ci

FROM frontend-dependencies AS frontend-build
COPY --chown=node:node frontend/ ./
COPY --chown=node:node templates/ /app/templates/
COPY --chown=node:node backend/documents.json /app/backend/documents.json
RUN npm run build

FROM golang:1.26-bookworm AS backend-dependencies
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download

FROM backend-dependencies AS backend-source
COPY backend/ ./

FROM backend-source AS backend-checks
CMD ["go", "test", "-race", "./..."]

FROM backend-source AS backend-build
RUN CGO_ENABLED=0 go build -trimpath -o /app/prelegal .

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend-build /app/prelegal /app/prelegal
COPY --from=frontend-build /app/frontend/out /app/frontend
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=4s --start-period=5s --retries=5 CMD ["/app/prelegal", "-healthcheck"]
ENTRYPOINT ["/app/prelegal"]
CMD ["-static-dir", "/app/frontend"]

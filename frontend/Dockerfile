FROM node:22-bookworm-slim AS dependencies
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/frontend
RUN chown node:node /app/frontend
COPY --chown=node:node frontend/package.json frontend/package-lock.json ./
USER node
RUN npm ci

FROM dependencies AS browser-dependencies
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER root
RUN npx playwright install --with-deps chromium
USER node

FROM dependencies AS development
COPY --chown=node:node frontend/ ./
COPY --chown=node:node templates/ /app/templates/
RUN mkdir -p .next
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

FROM browser-dependencies AS browser-tests
COPY --chown=node:node frontend/ ./
COPY --chown=node:node templates/ /app/templates/
RUN mkdir -p .next

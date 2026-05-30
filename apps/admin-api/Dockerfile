# ezmails admin-api — runs the monorepo workspace with tsx (no build step).
FROM node:20-alpine AS base
WORKDIR /app

# Workspace manifests first for layer caching.
COPY package.json package-lock.json* ./
COPY packages/db/package.json packages/db/
COPY apps/admin-api/package.json apps/admin-api/

RUN npm install --workspaces --include-workspace-root || npm install

# Source
COPY packages/db packages/db
COPY apps/admin-api apps/admin-api

# Generate Prisma client against the schema.
RUN npm run generate -w @ezmails/db

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@ezmails/admin-api"]

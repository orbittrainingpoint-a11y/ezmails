# ezmails admin-api — runs the monorepo workspace with tsx (no build step).
FROM node:20-alpine AS base
WORKDIR /app

# Prisma's query engine needs openssl at generate + runtime on Alpine/musl.
RUN apk add --no-cache openssl

# Copy ALL workspace manifests first so npm can resolve the full workspace graph
# (without every manifest, npm fails to install the @ezmails/db devDeps → no prisma CLI).
COPY package.json package-lock.json* ./
COPY packages/db/package.json packages/db/
COPY apps/admin-api/package.json apps/admin-api/
COPY apps/webmail-api/package.json apps/webmail-api/
COPY apps/frontend/package.json apps/frontend/

# Install with devDependencies (prisma, tsx). NODE_ENV is set to production AFTER
# this so the dev tooling needed to generate/run is available.
RUN npm install

# Source for the parts this image runs.
COPY packages/db packages/db
COPY apps/admin-api apps/admin-api

# Generate the Prisma client against the schema.
RUN npm run generate -w @ezmails/db

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@ezmails/admin-api"]

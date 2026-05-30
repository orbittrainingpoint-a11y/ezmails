# ezmails webmail-api — runs the monorepo workspace with tsx.
FROM node:20-alpine
WORKDIR /app

# Copy ALL workspace manifests first so npm can resolve the full workspace graph
# (without every manifest, npm fails to install the @ezmails/db devDeps → no prisma CLI).
COPY package.json package-lock.json* ./
COPY packages/db/package.json packages/db/
COPY apps/admin-api/package.json apps/admin-api/
COPY apps/webmail-api/package.json apps/webmail-api/
COPY apps/frontend/package.json apps/frontend/

# Install WITH devDependencies — prisma (build) and tsx (runtime) live there.
# Pin NODE_ENV=development + --include=dev for this layer so nothing in the build
# environment can omit them (that caused 'sh: prisma: not found').
RUN NODE_ENV=development npm install --include=dev --no-audit --no-fund

# Source for the parts this image runs.
COPY packages/db packages/db
COPY apps/webmail-api apps/webmail-api

# Generate the Prisma client against the schema.
RUN npm run generate -w @ezmails/db

ENV NODE_ENV=production
EXPOSE 3002
CMD ["npm", "run", "start", "-w", "@ezmails/webmail-api"]

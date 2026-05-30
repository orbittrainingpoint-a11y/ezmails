# ezmails webmail-api — runs the monorepo workspace with tsx.
FROM node:20-alpine
WORKDIR /app

# All workspace manifests so npm can resolve the workspace graph.
COPY package.json package-lock.json* ./
COPY packages/db/package.json packages/db/
COPY apps/admin-api/package.json apps/admin-api/
COPY apps/webmail-api/package.json apps/webmail-api/
COPY apps/frontend/package.json apps/frontend/

# Runtime (production) dependencies for the workspaces.
RUN npm install --omit=dev --no-audit --no-fund

# Prisma CLI + tsx GLOBALLY (workspace bin-hoisting leaves them off the npm-run PATH).
RUN npm install -g prisma@5.22.0 tsx@4.19.2

# Source for the parts this image runs.
COPY packages/db packages/db
COPY apps/webmail-api apps/webmail-api

# Generate the Prisma client (global CLI; outputs into the installed @prisma/client).
RUN cd packages/db && prisma generate

ENV NODE_ENV=production
EXPOSE 3002
CMD ["npm", "run", "start", "-w", "@ezmails/webmail-api"]

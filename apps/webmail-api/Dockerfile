# ezmails webmail-api — runs the monorepo workspace with tsx.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/db/package.json packages/db/
COPY apps/webmail-api/package.json apps/webmail-api/
RUN npm install --workspaces --include-workspace-root || npm install
COPY packages/db packages/db
COPY apps/webmail-api apps/webmail-api
RUN npm run generate -w @ezmails/db
ENV NODE_ENV=production
EXPOSE 3002
CMD ["npm", "run", "start", "-w", "@ezmails/webmail-api"]

# ezmails

**Self-hosted, VPS-based enterprise email hosting platform.** Custom webmail client, admin
control panel, customer/reseller portals, and a full Postfix + Dovecot + Rspamd mail stack —
all on your own server, no cloud dependencies.

> Built from `PRD_Email_Platform.md`, `FRD_Email_Platform.md`, `TRD_Email_Platform.md`.
> See [`BUILD_PLAN.md`](./BUILD_PLAN.md) for the phased build status.

## Why this stack

| Layer | Choice | Self-hosted? |
|-------|--------|:---:|
| App + mail database | **PostgreSQL 16** (single SQL engine) | ✅ |
| Sessions / queue / cache | **Redis 7** | ✅ |
| Mailbox files | **Dovecot Maildir** on disk | ✅ |
| MTA / IMAP / spam / AV | Postfix · Dovecot · Rspamd · ClamAV | ✅ |
| APIs | Node 20 · Fastify · Prisma | ✅ |
| Frontend | React 18 · Vite · Tailwind · Radix | ✅ |
| Proxy / TLS | Nginx · Let's Encrypt (acme.sh) | ✅ |

**Database note:** the reference design used PostgreSQL *and* MariaDB. ezmails drops MariaDB —
Postfix (`pgsql:` maps) and Dovecot (`pgsql` driver) read mail tables straight from PostgreSQL.
One SQL database means one thing to back up, secure, and tune. Zero cloud databases.

## Layout

```
ezmails/
├── apps/
│   ├── admin-api/      # Fastify — admin/reseller/customer control plane
│   ├── webmail-api/    # Fastify — IMAP/SMTP bridge for the webmail client
│   └── frontend/       # React — admin panel + webmail UI
├── packages/
│   └── db/             # Prisma schema + client (single Postgres DB)
├── config/
│   ├── postfix/        # main.cf + pgsql lookups
│   ├── dovecot/        # dovecot-sql.conf.ext + mail config
│   ├── rspamd/         # spam + DKIM signing
│   └── nginx/          # reverse proxy + TLS
├── scripts/
│   ├── install.sh      # one-command VPS installer
│   └── postgres-init/  # mail role + grants
└── docker-compose.yml
```

## Quick start (development)

```bash
cp .env.example .env          # fill in secrets (or run scripts/install.sh on a VPS)
npm install
npm run db:generate
docker compose up -d postgres redis
npm run db:push               # sync the Prisma schema to PostgreSQL
npm run db:seed               # creates the super_admin from SEED_ADMIN_* env
```

## Local demo (no Docker — native PostgreSQL + Redis)

For UI/feature testing without the mail stack. Requires a running PostgreSQL and Redis on
localhost. A root `.env` (already generated for dev) points the apps at them.

```bash
# 1. one-time: create db + schema + demo users
#    (psql -U postgres -c "CREATE ROLE ezmails LOGIN PASSWORD 'ezmails'; CREATE DATABASE ezmails OWNER ezmails;")
npm install
npm run db:generate
npm run push  -w @ezmails/db      # sync schema
npm run seed:demo -w @ezmails/db  # demo admin/reseller/customer + domain/mailboxes/logs

# 2. start the three dev servers (separate terminals)
npm run start -w @ezmails/admin-api      # :4002
npm run start -w @ezmails/webmail-api    # :4003
npm run dev   -w @ezmails/frontend       # http://localhost:5173 (proxies /api + /webmail-api)
```

Demo logins:

| Where | URL | Credentials |
|-------|-----|-------------|
| Admin panel | http://localhost:5173 | `admin@ezmails.local` / `Admin@12345` |
| Reseller | http://localhost:5173 | `reseller@ezmails.local` / `Reseller@123` |
| Customer | http://localhost:5173 | `customer@ezmails.local` / `Customer@123` |
| Webmail | http://localhost:5173/webmail/login | `john@demo.local` / `Demo@12345` |
| Public booking | http://localhost:5173/book/john-30min | — |

> Webmail login uses `WEBMAIL_DEV_BYPASS_IMAP=true` (verify password against the DB, no IMAP server).
> The inbox itself needs a real Dovecot/Postfix; webmail **Rules, Notes, Campaigns, Bookings,
> Signature Designer, and 2FA** all work in the demo. AI Smart Write needs a free `GEMINI_API_KEY`.

## Production install (VPS)

```bash
sudo bash scripts/install.sh
```

Requires Ubuntu 22.04/24.04, Docker 24+, a dedicated IPv4 with PTR/rDNS, and open ports
25, 465, 587, 993, 995, 80, 443, 4190.

# ezmails — Build Plan

> Self-hosted, VPS-based enterprise email platform (renamed from "MailForge" → **ezmails**).
> Derived from `PRD_Email_Platform.md`, `FRD_Email_Platform.md`, `TRD_Email_Platform.md`.

## Architecture decisions (locked)

- **Database: PostgreSQL 16 + Redis 7 only.** MariaDB dropped — Postfix (`pgsql:` maps) and
  Dovecot (`pgsql` driver) both read mail tables directly from PostgreSQL. One SQL engine = simpler
  backups, security, and ops. Everything is self-hosted via Docker — **no cloud database**.
- **Mailbox storage:** Dovecot Maildir on disk (Docker volume), not in a DB.
- **Monorepo:** npm workspaces. `apps/*` (services), `packages/*` (shared code), `config/*` (mail stack), `scripts/*`.
- **Stack per TRD §3:** Node 20 + Fastify + Prisma + Zod (APIs); React 18 + Vite + Tailwind + Radix (frontend);
  Postfix + Dovecot + Rspamd + ClamAV (mail); Nginx + Let's Encrypt (proxy/TLS).

## Phases (each phase ≈ one chat)

| # | Phase | Scope | Status |
|---|-------|-------|--------|
| 0 | Foundation | Monorepo, docker-compose, .env, **unified Prisma schema (Postgres)**, root configs, installer skeleton | ✅ done |
| 1 | Admin API — Auth | Fastify app, login, JWT, TOTP 2FA, sessions, password reset, RBAC, audit log (AUTH/RBAC-*) | ✅ done |
| 2 | Admin API — Domains | Domain CRUD, DNS record generation + validation, DKIM key gen/rotate (DOM/DKIM/DNS-*) | ✅ done |
| 3 | Admin API — Mailboxes | Mailbox/alias/forwarder/list CRUD writing to Postfix+Dovecot PG tables, CSV import (MBX/ALI/FWD/LIST-*) | ✅ done |
| 4 | Admin API — Ops | Dashboard metrics, mail queue, log search, nodes, WebSocket, BullMQ jobs (DASH/QUEUE/LOG/NODE/SPAM-*) | ✅ done |
| 5 | Admin API — Tenancy | Customer + reseller portal endpoints, notifications, backup/restore, REST API tokens (CUST/RES/NOTIF/BKP/API-*) | ✅ done |
| 6 | Frontend — Core | Vite app, Tailwind design tokens (blue-magenta, dark/light), UI primitives, router, auth screens | ✅ done |
| 7 | Frontend — Admin I | Dashboard, domain list, DNS wizard, DKIM panel | ✅ done |
| 8 | Frontend — Admin II | Mailboxes/aliases/forwarders, customers/resellers portal UI | ✅ done |
| 9 | Frontend — Admin III | Queue viewer, log viewer/trace, node management, notifications | ✅ done |
| 10 | Webmail API | IMAP (imapflow) + SMTP (nodemailer), folders, messages, contacts, search, sieve filters (WM-*) | ✅ done |
| 11 | Webmail Frontend | Inbox, reading pane, compose, folders, search, contacts, settings | ✅ done |
| 12 | Mail stack + ship | Postfix/Dovecot/Rspamd images, Nginx config, `install.sh`, node agent, smoke test | ✅ done |
| 13 | Titan features | AI Smart Write, Email Campaigns (+open tracking), Titan Bookings (+.ics), Signature Designer | ✅ done |
| 14 | Advanced webmail | **Gemini** AI (swap from Anthropic), folders + Outlook-style rules, per-email notes, 10 signature templates, webmail 2FA (Google Authenticator) | ✅ done |

## How we proceed
Each chat: pick the next ⬜ phase, build it fully, update this table to ✅, list exactly what to paste next.

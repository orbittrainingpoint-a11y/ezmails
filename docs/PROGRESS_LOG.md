# ezmails — Build Progress Log

A running record of each work session. Newest entries at the top.
See [`../BUILD_PLAN.md`](../BUILD_PLAN.md) for the phase status table.

---

## Session 13 — 2026-05-30 — Phase 14: Advanced webmail
**Goal:** Switch AI to free Gemini + add folders/rules, per-email notes, signature templates, webmail 2FA.

Schema: WebmailSettings gains totpSecret/totpEnabled/recoveryCodes; new `WebmailRule` + `WebmailNote`.

webmail-api:
- `lib/ai.ts` rewritten for **Google Gemini** (`GEMINI_API_KEY`, `GEMINI_MODEL` default gemini-2.0-flash);
  service interface unchanged.
- `services/totp.service.ts` (otplib + qrcode) — webmail 2FA enroll/verify/disable + login-code check
  (TOTP or single-use recovery code); login flow now returns an MFA challenge when enabled.
- `services/rule.service.ts` — Outlook-style rules (conditions any/all on from/to/subject, move to folder,
  mark read) + `applyRules` that scans a folder over IMAP and moves matches.
- `services/note.service.ts` — sticky notes keyed by RFC Message-ID (many per email).
- mail.service: `deleteFolder`/`renameFolder`; message read now returns `messageId`.
- Routes: `/auth/mfa` + `/auth/2fa/*`, `/rules/*` (+apply), `/notes`, `/folders/{delete,rename}`.

webmail UI:
- Login handles the **2FA code step**; Settings has a **Two-Factor (Google Authenticator)** card.
- Inbox: create/delete **folders**, **Run rules** button, and a **Notes** side panel (OneNote-style,
  colored sticky notes, pin/edit/delete) on the open email.
- New **Rules** page (nav) — build/enable/delete rules, run now.
- **Signature Designer** rebuilt with **10 selectable templates** + live preview.

**Verified:** all apps `tsc --noEmit` clean; `vite build` succeeds.

---

## Session 12 — 2026-05-30 — Phase 13: Titan features
**Goal:** Add the four premium tools: AI Smart Write, Email Campaigns, Titan Bookings, Signature Designer.

Schema: `Campaign`, `CampaignRecipient`, `BookingLink`, `Booking` (+enums), mailbox-scoped.

webmail-api:
- `lib/ai.ts` + `services/ai.service.ts` — Anthropic Messages API (model via `AI_MODEL`, default
  claude-sonnet-4-6); draft + quick-reply; gracefully disabled without `ANTHROPIC_API_KEY`.
- `services/campaign.service.ts` — create/import-CSV/send with `{{merge}}` fields + per-recipient
  **open-tracking pixel**; `routes/public.routes.ts` serves the 1×1 gif and marks opens.
- `services/booking.service.ts` — booking links, UTC weekly availability → computed slots,
  double-booking guard; public slug endpoints; `lib/ics.ts` generates downloadable .ics.
- Routes: `/ai/*`, `/campaigns/*`, `/booking-links/*`, `/bookings/*`, `/public/*`. tsc clean.

webmail UI:
- **AI Smart Write** button + prompt panel in Compose (generates subject + HTML body).
- **Campaigns** page (list, create, CSV recipient import, send, open-rate stats).
- **Bookings** page (link builder with weekday availability, shareable URL, bookings list + cancel).
- **Public booking page** `/book/:slug` (slot picker → confirm → .ics download), no auth.
- **Signature Designer** in Settings (structured fields → live HTML preview → save). tsc clean; vite build OK.

---

## Session 11 — 2026-05-30 — Phases 10–12: Webmail + Mail stack + Ship
Phase 10 webmail-api (IMAP/SMTP, contacts, settings), Phase 11 webmail client (inbox/compose/contacts/
settings), Phase 12 deployable mail stack: Postfix + Dovecot + Rspamd images (pgsql lookups, LMTP, DKIM
signing via shared key volume + selectors.map), node agent (queue/stats over HTTP), Nginx edge proxy
(panel + webmail vhosts, TLS/HSTS, /ws), finalized `install.sh` (secret gen, db push, seed admin +
primary node, certbot, smoke test) and `scripts/smoke-test.sh`. All apps tsc clean; admin-api 17/17.

---

## Session 10 — 2026-05-30 — Phase 9: Admin UI III (queue, logs, nodes, spam, settings)
**Goal:** Finish the admin panel — operations screens, settings, and the live notification bell.

Delivered:
- **Queue** (`features/ops/QueuePage`): cross-node table, retry/delete/flush, unreachable-node banner, 15s poll.
- **Mail Log** (`LogsPage`): filter bar (text/sender/recipient/status), delivery-trace dialog, **CSV export download**.
- **Nodes** (`NodesPage`): node cards with live CPU/RAM/disk gauges, register dialog, decommission, 30s poll.
- **Spam** (`SpamPage`): Rspamd threshold form, 24h score-distribution chart, allow/deny access-rule CRUD.
- **Settings** (`features/settings/SettingsPage`): **2FA enrollment** (QR + recovery codes + verify),
  **API token** create (one-time reveal) / revoke, appearance toggle, admin email-alert settings.
- **Notification bell** (`features/notifications`): unread badge, dropdown, dismiss, **live WS refresh**.
- Router wired: `/queue`, `/logs`, `/nodes`, `/spam`, `/settings`.

**Verified:** `tsc --noEmit` clean; `vite build` succeeds. **The admin panel is now feature-complete.**

---

## Session 9 — 2026-05-30 — Phase 8: Admin UI II (mailboxes, customers/resellers)
**Goal:** Mailbox/alias/forwarder management UI + the customer & reseller portal.

Delivered:
- `DomainSelect` shared picker.
- **Mailboxes** (`features/mailboxes`): domain-scoped page with tabs — Mailboxes (search, create with
  **password-strength meter** + quota, CSV **import preview→commit**, reset-password/suspend/delete
  row actions), Aliases (inline create incl. wildcard, delete), Forwarders (inline create + keep-copy).
- **Customers** (`features/customers`): Customers + Resellers tabs (resellers admin-only); create
  dialogs (reseller has quota pool/customer/domain caps), suspend/reactivate/delete, on-demand
  **usage report** dialog (domains/mailboxes/storage/messages).
- Router wired: `/mailboxes`, `/customers`.

**Verified:** `tsc --noEmit` clean.

---

## Session 8 — 2026-05-30 — Phase 7: Admin UI I (dashboard, domains, DNS, DKIM)
**Goal:** First real admin screens wired to the Phase 2/4 endpoints via TanStack Query.

Delivered:
- Shared primitives: `DataTable` (loading/empty/sortable), `Tabs` (Radix), `CopyButton`,
  `lib/useWebSocket.ts` (token-auth reconnect), `lib/format.ts` (bytes/number/date/relative).
- Recharts + @radix-ui/react-tabs added.
- **Dashboard** (`features/dashboard`): clickable metric cards, per-node CPU/RAM/disk gauges,
  7-day volume bar chart, top-domains chart; 30s polling + **live WebSocket** push into the query cache.
- **Domains** (`features/domains`): searchable list table + create dialog; detail page with tabs —
  **DNS wizard** (copy-paste records, live valid/missing/incorrect/propagating badges, re-check),
  **DKIM panel** (selector list, rotate, copy DNS host/TXT), and **Settings** (quotas/send-rate/
  catch-all/webmail toggle, suspend/reactivate, delete with confirm).
- Router wired: `/dashboard`, `/domains`, `/domains/:id`.

**Verified:** `tsc --noEmit` clean; `vite build` succeeds.

---

## Session 7 — 2026-05-30 — Phase 6: Frontend foundation
**Goal:** Stand up the React SPA — design system, API/auth plumbing, router, and auth screens.

Delivered:
- Vite + React 18 + TypeScript app (`apps/frontend`), Tailwind 3 with **blue-magenta design tokens**
  (`styles/index.css`) driven by `data-theme` for dark (default) / light, WCAG-AA focus rings.
- API client (`lib/api.ts`) — typed envelope unwrap, Bearer access token, **silent refresh on 401**
  (deduped), CSV passthrough; TanStack Query client; Zustand stores for auth (in-memory token) + theme.
- UI primitives (`components/ui`): Button, Input, Label, Card, Alert, Badge, Spinner, Dialog (Radix),
  Toaster (aria-live) + `toast` helper, ThemeToggle.
- App shell with role-aware sidebar nav + topbar (theme, user, logout); `ProtectedRoute` with
  session bootstrap (refresh → /me) and splash spinner.
- Auth screens: Login (+ remember device), MFA challenge, Forgot password, Reset password —
  react-hook-form + zod, wired to the Phase 1 endpoints.
- Frontend Dockerfile (build → nginx) + SPA nginx.conf; Vite dev proxy for /api + /ws.

**Verified:** `tsc --noEmit` clean; `vite build` succeeds (1734 modules, ~113 kB gzip JS).

---

## Session 6 — 2026-05-30 — Phase 5: Tenancy & backend completion
**Goal:** Customer/reseller portals, notification center, backup/restore, REST API tokens.
This finishes the entire admin API backend.

Covers FRD **CUST-001…005**, **RES-001…005**, **NOTIF-001…004**, **BKP-001…004**, **API-001…005**.

Delivered:
- `plugins/auth.ts` — extended to accept **personal API tokens** (opaque, SHA-256 hashed) in the
  Bearer header alongside JWTs; stamps `lastUsedAt`, honours expiry/revocation (API-001/002).
- `services/user.service.ts` — create customer (assign domains + quotas, enforce reseller customer
  cap), create reseller (quota pool), scoped lists, usage reports (mailboxes/storage/messages),
  suspend/reactivate (freezes user + their domains), delete, promote-to-reseller, adjust reseller quota.
- `services/notification.service.ts` — added list (own + broadcast), acknowledge, dismiss, and
  email-alert settings (NOTIF-002 via Setting store).
- `services/apitoken.service.ts` — generate (secret shown once), list, revoke.
- `services/backup.service.ts` — schedule (cron→repeatable BullMQ) or one-off, trigger, run (state
  machine; maildir archiving delegated to node agent in Phase 12), restore.
- `routes/tenancy.routes.ts` — `/customers`, `/resellers`, `/notifications`, `/backups`, `/api-tokens`
  with role checks + audit logging; `backup:run` wired into the worker switch.

**Verified:** `tsc --noEmit` clean; test suite 17/17.

**Backend status:** Admin API (Phases 1–5) is feature-complete across all FRD requirement groups.

---

## Session 5 — 2026-05-30 — Phase 4: Admin API Ops & Real-time
**Goal:** Dashboard, mail queue, log search/trace, node management, spam controls, WebSocket + jobs.

Covers FRD **DASH-001…006**, **QUEUE-001…006**, **LOG-001…006**, **NODE-001…006**, **SPAM-001…005**.

Schema additions: `Setting` (k/v config), `AccessRule` (allow/deny lists), `MailLog.spamScore`,
`AccessAction`/`AccessKind` enums. Regenerated client; switched deploy from `migrate deploy` to
`prisma db push` (no migration files yet) — updated installer + README.

Delivered:
- `lib/node-agent.ts` — HTTP client to per-node agents (queue/stats/quarantine); degrades to
  `{available:false}` so the panel still renders before Phase 12 stands up the agents.
- `lib/queue.ts` — BullMQ queue + worker factory + repeatable jobs (DNS revalidate 15m, node health
  1m, log retention daily).
- `lib/ws-hub.ts` — WebSocket fan-out over Redis pub/sub (node:stats, queue:update, alert).
- `lib/settings.ts` — typed Setting accessors + spam thresholds.
- `services/dashboard.service.ts` — counters, 7-day volume (`date_trunc` raw SQL), top domains by
  volume + bounce rate, live node gauges.
- `services/log.service.ts` — filtered + full-text search, delivery trace, CSV export, ingest, retention prune.
- `services/queue.service.ts` — cross-node queue list/retry/delete/flush via agents.
- `services/node.service.ts` — register/list/stats/decommission(+migrate), health poll w/ alerts.
- `services/spam.service.ts` — thresholds, allow/deny rules, score distribution, quarantine.
- `services/notification.service.ts` — create + real-time broadcast (list/ack land in Phase 5).
- `routes/ops.routes.ts` (admin) + `routes/internal.routes.ts` (token-guarded log ingest);
  `/ws` WebSocket route (JWT via query); workers started from `index.ts` (gated by `ENABLE_WORKERS`).

**Verified:** `tsc --noEmit` clean; test suite 17/17.

**Endpoints live:** `/api/v1/dashboard[/volume|/top-domains]` · `/api/v1/queue[/flush|/:id/retry]` ·
`/api/v1/logs[/export|/:queueId]` · `/api/v1/nodes[/:id/stats]` ·
`/api/v1/spam/{thresholds,score-distribution,access-rules,quarantine/...}` ·
`/api/v1/internal/logs/ingest` · `GET /ws`.

---

## Session 4 — 2026-05-30 — Phase 3: Admin API Mailboxes / Aliases / Forwarders / Lists
**Goal:** Full mail-entity management writing to the same Postgres tables Postfix & Dovecot read.

Covers FRD **MBX-001…012**, **ALI-001…004**, **FWD-001…003**, **LIST-001…004**.

Delivered:
- `lib/password.ts` — Dovecot `{BLF-CRYPT}` (bcrypt) password generation + server-side policy.
  (Chose BLF-CRYPT over hand-rolled SHA512-CRYPT; Dovecot honours the per-record scheme prefix.
  Updated `config/dovecot/dovecot-sql.conf.ext` default accordingly.)
- `lib/csv.ts` — dependency-free CSV parser (quotes, escaped quotes, header→object mapping).
- `lib/scope.ts` — added `getScopedMailbox` / `assertChildAccess` ownership guards.
- `services/mailbox.service.ts` — create (enforces local-part rules, domain mailbox cap, password
  policy, maildir path), scoped+sortable+paged list, update (all fields except local part), reset
  password, suspend/unsuspend, delete; **CSV import preview + commit** with per-row validation.
- `services/alias.service.ts` — aliases incl. wildcard `*@domain`, multi-destination, edit destination.
- `services/forwarder.service.ts` — forwarders w/ keep-copy + **DMARC-reject warning** (live DoH check).
- `services/list.service.ts` — mailing lists, member add/remove, bulk member import, moderated flag.
- `routes/mail.routes.ts` — all endpoints under `/api/v1` with role checks (mailboxes allow scoped
  customers per CUST-003; aliases/forwarders/lists are admin/reseller) + audit logging.

**Verified:** `tsc --noEmit` clean; test suite 17/17 (added CSV parser + import-validation tests).

**Endpoints live:** mailboxes `GET/POST /domains/:id/mailboxes`, `…/import[/preview]`,
`GET/PATCH/DELETE /mailboxes/:id`, `…/{reset-password,suspend,unsuspend}` · aliases
`GET/POST /domains/:id/aliases`, `PATCH/DELETE /aliases/:id` · forwarders
`GET/POST /domains/:id/forwarders`, `DELETE /forwarders/:id` · lists
`GET/POST /domains/:id/lists`, `GET /lists/:id`, `POST /lists/:id/members`,
`DELETE /lists/:id/members/:memberId`, `DELETE /lists/:id`.

---

## Session 3 — 2026-05-30 — Phase 2: Admin API Domains / DNS / DKIM
**Goal:** Domain lifecycle plus DNS record generation/validation and DKIM key management.

Covers FRD **DOM-001…016**, **DKIM-001…004**, and the DNS-validation requirements.

Delivered:
- `lib/dns.ts` — DNS-over-HTTPS resolver (Cloudflare JSON) + TXT/FQDN normalisers.
- `lib/dkim.ts` — 2048-bit RSA key generation + publishable `v=DKIM1` DNS value; date-stamped selectors.
- `lib/scope.ts` — RBAC ownership scoping (super_admin → all, reseller → self+customers, customer → own).
- `services/dns.service.ts` — builds MX/SPF/DKIM/DMARC records on domain creation; live re-validation
  resolves each record and sets status valid/missing/incorrect/propagating.
- `services/dkim.service.ts` — initial key on create, rotate (grace period, both keys active, new DNS
  record), export public key as TXT, best-effort key-file sync to the Rspamd dir (full wiring in Phase 12).
- `services/domain.service.ts` — create (domain+DKIM+DNS in one flow), scoped list w/ search+paging,
  detail, update, suspend/unsuspend, delete (cascades).
- `routes/domain.routes.ts` — all `/api/v1/domains` endpoints with per-route role checks + audit logging.
- BigInt→string JSON serialization for byte-quota fields.

**Verified:** `tsc --noEmit` clean; test suite 10/10 (added DKIM keygen + DNS-helper tests).

**Endpoints live:** `GET/POST /api/v1/domains` · `GET/PATCH/DELETE /api/v1/domains/:id` ·
`POST /api/v1/domains/:id/{suspend,unsuspend}` · `GET /api/v1/domains/:id/dns` ·
`POST /api/v1/domains/:id/dns/validate` · `GET /api/v1/domains/:id/dkim` ·
`POST /api/v1/domains/:id/dkim/rotate`.

---

## Session 2 — 2026-05-30 — Phase 1: Admin API Auth
**Goal:** Build the complete authentication & access-control layer for the admin API.

Covers FRD requirements **AUTH-001…010** and **RBAC-001…006**.

Delivered:
- `apps/admin-api` Fastify app scaffold (env validation, Prisma + Redis wiring, structured logging, error format).
- Crypto lib: AES-256-GCM (TOTP secret encryption), SHA-256 hashing, secure token generation.
- JWT access tokens (jose, HS512) + opaque refresh tokens stored hashed in `sessions`.
- Login with bcrypt verify, per-account lockout (5 attempts / 15 min) + per-IP rate limit (10/min) via Redis sliding window.
- TOTP 2FA: setup (QR + encrypted secret), verify, backup recovery codes; MFA-gated login flow.
- Password reset via email link (1-hour token in Redis) using Nodemailer → Postfix.
- "Remember this device for 30 days" via extended refresh session.
- Sessions: list, logout, admin force-logout-all.
- RBAC plugin (`requireRole`) — server-side role enforcement on every route.
- Audit logging of all auth events (IP, UA, timestamp).

**Verified:** `@ezmails/db` builds, Prisma client generates, `admin-api` typechecks clean (`tsc --noEmit`),
and the crypto unit suite passes (6/6 — AES-256-GCM round-trip, tamper rejection, hashing, tokens).

**Endpoints live:** `POST /api/v1/auth/{login, mfa/verify, refresh, logout, totp/setup, totp/verify,
password/reset-request, password/reset, force-logout}` · `GET /api/v1/auth/{me, sessions}` · `GET /health`.

---

## Session 1 — 2026-05-30 — Phase 0: Foundation
**Goal:** Stand up the project skeleton, lock the database choice, and create the phased build plan.

Key decision — **database**: dropped the TRD's MariaDB. Using **PostgreSQL 16 + Redis 7 only**.
Postfix (`pgsql:` maps) and Dovecot (`pgsql` driver) read mail tables directly from the same
Postgres DB the app uses. Fully self-hosted via Docker — no cloud database.

Delivered:
- Renamed product "MailForge" → **ezmails**.
- `BUILD_PLAN.md` — 13 phases (0–12), one phase ≈ one chat.
- npm-workspaces monorepo: `package.json`, `.gitignore`, `.env.example`.
- `docker-compose.yml` — all services, MariaDB removed, health checks added.
- `packages/db` — unified Prisma schema (validated), client singleton, seed, tsconfig.
- `config/postfix/pgsql/*.cf` + `config/dovecot/dovecot-sql.conf.ext` — mail stack ↔ Postgres lookups.
- `scripts/install.sh` (installer skeleton) + `scripts/postgres-init/01-mail-role.sql` (read-only mail role).
- `README.md`.

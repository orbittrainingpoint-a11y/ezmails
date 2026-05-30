#!/usr/bin/env bash
# ezmails installer — one-command VPS setup (Ubuntu 22.04/24.04).
#
# Layout it produces on a single domain:
#   https://<DOMAIN>/                  → webmail  (the common URL for email users)
#   https://<DOMAIN>/<secret-path>/    → admin control panel (unique, secret)
#
# Re-runnable: keeps an existing .env (delete it to regenerate secrets).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log()  { printf '\033[1;34m[ezmails]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }
rand_hex() { openssl rand -hex "$1"; }

# ── 1. Pre-flight checks ──────────────────────────────────────
log "Running pre-flight checks..."
[[ "$(uname -s)" == "Linux" ]] || warn "Non-Linux host; production target is Ubuntu 22.04/24.04."
command -v docker >/dev/null      || die "Docker not found. Install Docker 24+ first (see DEPLOY.md)."
docker compose version >/dev/null || die "Docker Compose v2 not found."
command -v openssl >/dev/null     || die "openssl required for secret generation."
command -v a2ensite >/dev/null    || die "Apache not found. Install it first: sudo apt install -y apache2 (see DEPLOY.md)."
[[ $EUID -eq 0 ]] || warn "Not running as root — Apache/certbot steps may need sudo."

MEM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
if [[ "$MEM_KB" -gt 0 && "$MEM_KB" -lt 3800000 ]]; then
  warn "Less than 4 GB RAM detected. ClamAV + Rspamd may be tight; consider adding swap."
fi
if ! timeout 5 bash -c "</dev/tcp/gmail-smtp-in.l.google.com/25" 2>/dev/null; then
  warn "Outbound port 25 looks blocked by your provider. External email delivery will need an SMTP relay."
fi

# ── 2. Configuration ──────────────────────────────────────────
if [[ -f .env ]]; then
  warn ".env already exists — keeping existing secrets. Delete it to regenerate."
  # shellcheck disable=SC1091
  set -a; source .env; set +a
  DOMAIN="${DOMAIN:-}"
  ADMIN_BASE_PATH="${ADMIN_BASE_PATH:-}"
  # Guard against a developer .env (e.g. copied from a laptop) being used in prod.
  if [[ "${WEBMAIL_DEV_BYPASS_IMAP:-false}" == "true" || "${NODE_ENV:-production}" == "development" ]]; then
    die "This looks like a DEVELOPMENT .env (WEBMAIL_DEV_BYPASS_IMAP=true / NODE_ENV=development).
       Delete it and re-run so a fresh production .env is generated:  rm -f .env && bash scripts/install.sh"
  fi
else
  log "Collecting configuration..."
  read -rp "Public domain for this server (e.g. mail.yourdomain.com): " DOMAIN
  [[ -n "$DOMAIN" ]] || die "Domain is required."
  read -rp "Admin email address (login + Let's Encrypt): " ADMIN_EMAIL
  read -rsp "Admin password: " ADMIN_PASSWORD; echo
  [[ -n "$ADMIN_PASSWORD" ]] || die "Admin password is required."

  read -rp "Also create a reseller portal account? email (blank to skip): " RESELLER_EMAIL || true
  if [[ -n "${RESELLER_EMAIL:-}" ]]; then read -rsp "Reseller password: " RESELLER_PASSWORD; echo; fi
  read -rp "Also create a customer portal account? email (blank to skip): " CUSTOMER_EMAIL || true
  if [[ -n "${CUSTOMER_EMAIL:-}" ]]; then read -rsp "Customer password: " CUSTOMER_PASSWORD; echo; fi

  # Unique, secret admin base path.
  ADMIN_BASE_PATH="/control-$(rand_hex 5)"

  PG_PW=$(rand_hex 24); MAIL_PW=$(rand_hex 24); REDIS_PW=$(rand_hex 24)
  JWT_PW=$(rand_hex 64); TOTP_PW=$(rand_hex 32); INTERNAL_PW=$(rand_hex 24)

  log "Writing .env (admin panel path: ${ADMIN_BASE_PATH})..."
  cp .env.example .env
  sed -i \
    -e "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" \
    -e "s|^ADMIN_BASE_PATH=.*|ADMIN_BASE_PATH=${ADMIN_BASE_PATH}|" \
    -e "s|^ADMIN_PANEL_URL=.*|ADMIN_PANEL_URL=https://${DOMAIN}|" \
    -e "s|^WEBMAIL_URL=.*|WEBMAIL_URL=https://${DOMAIN}|" \
    -e "s|^WEBMAIL_DEV_BYPASS_IMAP=.*|WEBMAIL_DEV_BYPASS_IMAP=false|" \
    -e "s|^MAIL_HOSTNAME=.*|MAIL_HOSTNAME=${DOMAIN}|" \
    -e "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://${DOMAIN}|" \
    -e "s|^ACME_EMAIL=.*|ACME_EMAIL=${ADMIN_EMAIL}|" \
    -e "s|^ACME_DOMAINS=.*|ACME_DOMAINS=${DOMAIN}|" \
    -e "s|^ALERT_FROM=.*|ALERT_FROM=alerts@${DOMAIN}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PW}|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://ezmails:${PG_PW}@postgres:5432/ezmails?schema=public|" \
    -e "s|^MAIL_DB_PASSWORD=.*|MAIL_DB_PASSWORD=${MAIL_PW}|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PW}|" \
    -e "s|^REDIS_URL=.*|REDIS_URL=redis://:${REDIS_PW}@redis:6379|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_PW}|" \
    -e "s|^TOTP_ENCRYPTION_KEY=.*|TOTP_ENCRYPTION_KEY=${TOTP_PW}|" \
    .env
  grep -q '^INTERNAL_TOKEN=' .env \
    && sed -i "s|^INTERNAL_TOKEN=.*|INTERNAL_TOKEN=${INTERNAL_PW}|" .env \
    || echo "INTERNAL_TOKEN=${INTERNAL_PW}" >> .env

  # Propagate the mail role password into Postgres init + Postfix/Dovecot lookups.
  sed -i "s|CHANGE_ME|${MAIL_PW}|g" scripts/postgres-init/01-mail-role.sql
  find config/postfix/pgsql -name '*.cf' -exec sed -i "s|password = CHANGE_ME|password = ${MAIL_PW}|" {} +
  sed -i "s|password=CHANGE_ME|password=${MAIL_PW}|" config/dovecot/dovecot-sql.conf.ext
  # Rspamd Redis password.
  [[ -f config/rspamd/redis.conf ]] && sed -i "s|__REDIS_PASSWORD__|${REDIS_PW}|" config/rspamd/redis.conf || true

  chmod 600 .env
  export SEED_ADMIN_EMAIL="$ADMIN_EMAIL" SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD"
  export SEED_RESELLER_EMAIL="${RESELLER_EMAIL:-}" SEED_RESELLER_PASSWORD="${RESELLER_PASSWORD:-}"
  export SEED_CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-}" SEED_CUSTOMER_PASSWORD="${CUSTOMER_PASSWORD:-}"
  log ".env created (chmod 600)."
fi

[[ -n "$DOMAIN" ]] || die "DOMAIN missing from .env — delete .env and re-run."

# Seeding credentials are never written to disk, so on a re-run (existing .env)
# we must (re)collect them. seed.ts is idempotent (upsert), so re-entering is safe.
if [[ -z "${SEED_ADMIN_PASSWORD:-}" ]]; then
  log "Admin/portal login credentials (used to create or update the accounts):"
  SEED_ADMIN_EMAIL="${ACME_EMAIL:-}"
  [[ -n "$SEED_ADMIN_EMAIL" ]] || read -rp "Admin email: " SEED_ADMIN_EMAIL
  read -rsp "Admin password for ${SEED_ADMIN_EMAIL}: " SEED_ADMIN_PASSWORD; echo
  [[ -n "$SEED_ADMIN_PASSWORD" ]] || die "Admin password is required to seed the login."
  read -rp "Reseller portal email (blank to skip): " SEED_RESELLER_EMAIL || true
  if [[ -n "${SEED_RESELLER_EMAIL:-}" ]]; then read -rsp "Reseller password: " SEED_RESELLER_PASSWORD; echo; fi
  read -rp "Customer portal email (blank to skip): " SEED_CUSTOMER_EMAIL || true
  if [[ -n "${SEED_CUSTOMER_EMAIL:-}" ]]; then read -rsp "Customer password: " SEED_CUSTOMER_PASSWORD; echo; fi
  export SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD \
         SEED_RESELLER_EMAIL="${SEED_RESELLER_EMAIL:-}" SEED_RESELLER_PASSWORD="${SEED_RESELLER_PASSWORD:-}" \
         SEED_CUSTOMER_EMAIL="${SEED_CUSTOMER_EMAIL:-}" SEED_CUSTOMER_PASSWORD="${SEED_CUSTOMER_PASSWORD:-}"
fi

SUDO=""; [[ $EUID -eq 0 ]] || SUDO="sudo"

# ── 3. Build & deploy the Docker stack ────────────────────────
log "Building images (frontend bakes in the secret admin path)..."
docker compose pull --ignore-buildable 2>/dev/null || true
docker compose build

log "Starting data layer..."
docker compose up -d postgres redis
log "Waiting for Postgres to be healthy..."
for _ in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U ezmails -d ezmails >/dev/null 2>&1 && break
  sleep 2
done

log "Applying database schema..."
docker compose run --rm admin-api npm run db:push
log "Seeding admin + portal users (no demo mailboxes)..."
docker compose run --rm \
  -e SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-}" -e SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-}" \
  -e SEED_RESELLER_EMAIL="${SEED_RESELLER_EMAIL:-}" -e SEED_RESELLER_PASSWORD="${SEED_RESELLER_PASSWORD:-}" \
  -e SEED_CUSTOMER_EMAIL="${SEED_CUSTOMER_EMAIL:-}" -e SEED_CUSTOMER_PASSWORD="${SEED_CUSTOMER_PASSWORD:-}" \
  admin-api npm run db:seed

log "Starting all services (admin-api:3001, webmail-api:3002, frontend:8080 on 127.0.0.1)..."
docker compose up -d

# ── 4. Configure host Apache as the reverse proxy ─────────────
log "Configuring Apache reverse proxy for ${DOMAIN}..."
$SUDO a2enmod proxy proxy_http proxy_wstunnel ssl headers rewrite >/dev/null 2>&1 || true

VHOST_SRC="config/apache/ezmails.conf"
VHOST_DST="/etc/apache2/sites-available/ezmails.conf"
TMP_VHOST="$(mktemp)"
sed "s|__DOMAIN__|${DOMAIN}|g" "$VHOST_SRC" > "$TMP_VHOST"
$SUDO cp "$TMP_VHOST" "$VHOST_DST"
rm -f "$TMP_VHOST"

$SUDO a2ensite ezmails >/dev/null 2>&1 || true
$SUDO a2dissite 000-default >/dev/null 2>&1 || true
if $SUDO apache2ctl configtest 2>/dev/null; then
  $SUDO systemctl reload apache2 || $SUDO service apache2 reload || true
else
  warn "apache2ctl configtest failed — check ${VHOST_DST}. Stack containers are still running."
fi

# ── 5. Let's Encrypt via certbot's Apache plugin (best-effort) ─
log "Requesting a Let's Encrypt certificate for ${DOMAIN}..."
if ! command -v certbot >/dev/null 2>&1; then
  $SUDO apt-get update -y >/dev/null 2>&1 || true
  $SUDO apt-get install -y certbot python3-certbot-apache >/dev/null 2>&1 || warn "Could not auto-install certbot."
fi
if command -v certbot >/dev/null 2>&1; then
  if $SUDO certbot --apache -d "${DOMAIN}" --agree-tos -m "${ACME_EMAIL:-admin@${DOMAIN}}" -n --redirect --keep-until-expiring; then
    $SUDO systemctl reload apache2 2>/dev/null || true
    log "TLS issued and Apache reloaded."
  else
    warn "certbot failed (is DNS A-record ${DOMAIN} → this VPS live yet?). Site is up on http:// for now."
    warn "Once DNS resolves, run: bash scripts/issue-cert.sh"
  fi
else
  warn "certbot not available — site is on http://. Install certbot + python3-certbot-apache, then run scripts/issue-cert.sh"
fi

# ── 6. Post-install ───────────────────────────────────────────
log "Container status:"
docker compose ps

cat <<EOF

  ────────────────────────────────────────────────────────────
  ezmails is up.

    Webmail (email users):  https://${DOMAIN}/
    Admin control panel:    https://${DOMAIN}${ADMIN_BASE_PATH}
        (keep this path secret — it is your unique admin URL)

  Next steps:
    1. Point DNS A record:  ${DOMAIN}  →  this VPS IP
    2. Set the VPS PTR (reverse DNS) to ${DOMAIN} in Hostinger.
    3. Log into the admin panel, add your mail domain, and publish
       the MX / SPF / DKIM / DMARC records it shows.
    4. Create mailboxes in the panel — users then log in at https://${DOMAIN}/
  ────────────────────────────────────────────────────────────
EOF

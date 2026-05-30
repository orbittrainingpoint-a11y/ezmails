#!/usr/bin/env bash
# Issue / renew the Let's Encrypt certificate for ezmails via Apache and reload.
# Run after the DNS A-record for $DOMAIN points at this VPS.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
[[ -f .env ]] || { echo "No .env found — run scripts/install.sh first." >&2; exit 1; }
# shellcheck disable=SC1091
set -a; source .env; set +a
: "${DOMAIN:?DOMAIN missing from .env}"

SUDO=""; [[ $EUID -eq 0 ]] || SUDO="sudo"

if ! command -v certbot >/dev/null 2>&1; then
  $SUDO apt-get update -y && $SUDO apt-get install -y certbot python3-certbot-apache
fi

$SUDO certbot --apache -d "${DOMAIN}" \
  --agree-tos -m "${ACME_EMAIL:-admin@${DOMAIN}}" -n --redirect --keep-until-expiring

# Make sure Postfix/Dovecot pick up the (possibly renewed) cert.
$SUDO systemctl reload apache2 2>/dev/null || true
docker compose restart postfix dovecot 2>/dev/null || true
echo "Certificate up to date for ${DOMAIN}."

#!/usr/bin/env bash
# Prints your ezmails webmail + admin URLs (with the secret admin path) from .env.
# Usage:  bash scripts/show-urls.sh   (run from the ezmails dir, or it auto-finds /var/www/html/ezmails)
set -euo pipefail

# Find the .env: current dir first, then the usual deploy location.
if [[ -f .env ]]; then
  ENV_FILE=".env"
elif [[ -f /var/www/html/ezmails/.env ]]; then
  ENV_FILE="/var/www/html/ezmails/.env"
else
  echo "Could not find .env (looked in ./.env and /var/www/html/ezmails/.env)." >&2
  exit 1
fi

# Read values, strip optional surrounding quotes/whitespace.
get() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'\'' ' ; }

DOMAIN="$(get DOMAIN)"
ADMIN_PATH="$(get ADMIN_BASE_PATH)"

echo ""
echo "  Webmail (email users):  https://${DOMAIN}/"
echo "  Admin control panel:    https://${DOMAIN}${ADMIN_PATH}"
echo ""
echo "  (admin path comes from ADMIN_BASE_PATH in ${ENV_FILE})"
echo ""

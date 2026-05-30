#!/bin/sh
# Substitute runtime values into the Postfix config, start the node agent, then
# run Postfix in the foreground.
set -e

: "${MAIL_HOSTNAME:=mail.localhost}"

sed -i "s/__MAIL_HOSTNAME__/${MAIL_HOSTNAME}/g" /etc/postfix/main.cf

# If no real certificate is mounted yet, fall back to Postfix's snakeoil so the
# daemon still starts (installer requests Let's Encrypt afterwards).
CERT="/etc/letsencrypt/live/${MAIL_HOSTNAME}/fullchain.pem"
if [ ! -f "$CERT" ]; then
  echo "[postfix] no cert at $CERT yet — using a temporary self-signed cert."
  mkdir -p "/etc/letsencrypt/live/${MAIL_HOSTNAME}"
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
    -keyout "/etc/letsencrypt/live/${MAIL_HOSTNAME}/privkey.pem" \
    -out "$CERT" -subj "/CN=${MAIL_HOSTNAME}" >/dev/null 2>&1 || true
fi

# Node agent (queue + host stats) on :9101.
EZMAILS_ROLE=postfix node /usr/local/bin/node-agent.mjs &

postfix start-fg

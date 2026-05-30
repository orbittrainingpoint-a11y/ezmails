#!/bin/sh
set -e
: "${MAIL_HOSTNAME:=mail.localhost}"
: "${MAIL_DB_PASSWORD:=}"

sed -i "s/__MAIL_HOSTNAME__/${MAIL_HOSTNAME}/g" /etc/dovecot/dovecot.conf

# Inject the DB password into the SQL connect string (installer also bakes it in,
# but honour the env at runtime as a fallback).
if [ -n "$MAIL_DB_PASSWORD" ]; then
  sed -i "s/password=CHANGE_ME/password=${MAIL_DB_PASSWORD}/" /etc/dovecot/dovecot-sql.conf.ext
fi

CERT="/etc/letsencrypt/live/${MAIL_HOSTNAME}/fullchain.pem"
if [ ! -f "$CERT" ]; then
  echo "[dovecot] no cert yet — generating temporary self-signed."
  mkdir -p "/etc/letsencrypt/live/${MAIL_HOSTNAME}"
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
    -keyout "/etc/letsencrypt/live/${MAIL_HOSTNAME}/privkey.pem" \
    -out "$CERT" -subj "/CN=${MAIL_HOSTNAME}" >/dev/null 2>&1 || true
fi

mkdir -p /var/mail/vhosts && chown -R vmail:vmail /var/mail/vhosts

exec dovecot -F

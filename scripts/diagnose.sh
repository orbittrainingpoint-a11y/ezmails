#!/usr/bin/env bash
# ezmails post-cutover health check. Read-only — changes nothing.
# Run from the deploy dir:  bash scripts/diagnose.sh
# Paste the whole output back to get specific fixes.

cd "$(dirname "$0")/.." 2>/dev/null || true
[[ -f .env ]] || cd /var/www/html/ezmails 2>/dev/null || true

ENV_FILE=".env"
[[ -f "$ENV_FILE" ]] || { echo "No .env found here. cd to /var/www/html/ezmails first."; exit 1; }

get() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'\'' '; }
DOMAIN="$(get DOMAIN)"
ADMIN_PATH="$(get ADMIN_BASE_PATH)"
DEVBYPASS="$(get WEBMAIL_DEV_BYPASS_IMAP)"
MAILHOST="$(get MAIL_HOSTNAME)"
IP="$(curl -s4 ifconfig.me 2>/dev/null || echo '?')"

line() { printf '\n=== %s ===\n' "$1"; }

line "CONFIG (.env)"
echo "DOMAIN              = $DOMAIN"
echo "MAIL_HOSTNAME       = $MAILHOST"
echo "ADMIN URL           = https://$DOMAIN$ADMIN_PATH"
echo "WEBMAIL_DEV_BYPASS  = $DEVBYPASS   (MUST be false in production)"
echo "Server public IP    = $IP"
[[ "$DOMAIN" == "$MAILHOST" ]] || echo "!! DOMAIN and MAIL_HOSTNAME differ — they should match for the bare-apex setup."
[[ "$DEVBYPASS" == "false" ]] || echo "!! WEBMAIL_DEV_BYPASS_IMAP is not false — webmail will use the fake dev store, not real mail."

line "DNS"
if command -v dig >/dev/null; then
  echo "A    $DOMAIN -> $(dig +short A "$DOMAIN" | tr '\n' ' ')"
  echo "MX   $DOMAIN -> $(dig +short MX "$DOMAIN" | tr '\n' ' ')"
  echo "SPF          -> $(dig +short TXT "$DOMAIN" | grep -i spf1 || echo 'MISSING')"
  echo "DMARC        -> $(dig +short TXT "_dmarc.$DOMAIN" | head -n1 || echo 'MISSING')"
  echo "PTR  $IP -> $(dig +short -x "$IP" | tr '\n' ' ')   (should be $DOMAIN)"
else
  echo "dig not installed (sudo apt install -y dnsutils) — skipping DNS checks."
fi

line "TLS CERT"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if sudo test -f "$CERT" 2>/dev/null; then
  echo "Cert present: $CERT"
  echo "  Subject : $(sudo openssl x509 -noout -subject -in "$CERT" 2>/dev/null | sed 's/subject=//')"
  echo "  Expires : $(sudo openssl x509 -noout -enddate -in "$CERT" 2>/dev/null | sed 's/notAfter=//')"
else
  echo "!! No Let's Encrypt cert for $DOMAIN at $CERT — run: sudo certbot --apache -d $DOMAIN"
fi

line "LISTENING PORTS (host)"
for p in 25 80 443 465 587 993; do
  if sudo ss -ltn 2>/dev/null | grep -q ":$p "; then echo "  $p  open"; else echo "  $p  CLOSED"; fi
done

line "CONTAINERS"
docker compose ps 2>/dev/null | sed '1!{/Up\|running\|healthy/!s/$/   <-- not running?/}'

line "POSTFIX HOSTNAME"
docker compose exec -T postfix postconf -h myhostname 2>/dev/null | sed 's/^/  myhostname = /' \
  || echo "  (postfix container not running — start with: docker compose --profile mail up -d)"

line "DKIM SELECTORS (rspamd)"
docker compose exec -T rspamd sh -c 'cat /var/lib/rspamd/dkim/selectors.map 2>/dev/null; echo "--- keys ---"; ls -1 /var/lib/rspamd/dkim/*.key 2>/dev/null' \
  || echo "  (rspamd container not running)"

line "DATABASE — domains, mailboxes, admins"
docker compose exec -T postgres psql -U "$(get POSTGRES_USER)" -d "$(get POSTGRES_DB)" -A -F' | ' 2>/dev/null <<'SQL'
SELECT 'DOMAIN', domain_name, is_active::text FROM domains ORDER BY domain_name;
SELECT 'MAILBOX', email, status::text FROM mailboxes ORDER BY email;
SELECT 'ADMIN', email, role::text FROM users ORDER BY role;
SQL
[[ $? -eq 0 ]] || echo "  (could not query DB — is the postgres container up?)"

printf '\n=== DONE — paste everything above ===\n\n'

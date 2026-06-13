#!/usr/bin/env bash
# ezmails host hardening: fail2ban (SSH brute-force) + UFW firewall.
# Safe + idempotent. Run as root on the Ubuntu VPS:  sudo bash scripts/harden-host.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Installing fail2ban + ufw"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq fail2ban ufw >/dev/null

echo "==> Installing fail2ban SSH jail"
install -m 644 "$REPO_DIR/config/fail2ban/jail.local" /etc/fail2ban/jail.local
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban
echo "    fail2ban status:"; fail2ban-client status sshd 2>/dev/null | sed 's/^/    /' || true

echo "==> Configuring UFW firewall"
# IMPORTANT: allow SSH FIRST so we never lock ourselves out.
ufw allow 22/tcp        comment 'SSH'        >/dev/null
ufw allow 80/tcp        comment 'HTTP'       >/dev/null
ufw allow 443/tcp       comment 'HTTPS'      >/dev/null
ufw allow 25/tcp        comment 'SMTP'       >/dev/null
ufw allow 465/tcp       comment 'SMTPS'      >/dev/null
ufw allow 587/tcp       comment 'Submission' >/dev/null
ufw allow 993/tcp       comment 'IMAPS'      >/dev/null
ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
ufw --force enable
ufw status verbose | sed 's/^/    /'

cat <<'NOTE'

==> Done. Notes:
  * fail2ban now bans IPs after repeated SSH login failures (host auth.log).
  * The mail ports (25/465/587/993) MUST stay public — a mail server needs them.
    They are also brute-force-throttled at the protocol level (auth_failure_delay,
    connection/error limits in the Postfix/Dovecot config).
  * CAVEAT: Docker publishes its mapped ports by editing iptables DIRECTLY, so UFW
    does NOT filter Docker-published ports. The ezmails API ports are already bound
    to 127.0.0.1 (private). The mail ports are meant to be public anyway, so this is
    fine — just know UFW mainly protects host services (SSH) here.
  * Recommended (do manually, carefully): disable SSH password login and use keys —
    edit /etc/ssh/sshd_config: PasswordAuthentication no, PermitRootLogin prohibit-password,
    then: systemctl restart ssh   (make sure your key works first!).
NOTE

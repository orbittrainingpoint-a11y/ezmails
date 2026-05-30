# Deploying ezmails on a Hostinger Ubuntu VPS (Apache reverse proxy)

Target server: **88.222.215.20** (Ubuntu 22.04/24.04), using the host's **Apache** as the
TLS terminator / reverse proxy in front of the Docker stack.

After deploy you get **one domain** with:

| URL | What |
|-----|------|
| `https://<your-domain>/` | **Webmail** — the common URL your email users log into |
| `https://<your-domain>/control-XXXXXXXXXX` | **Admin panel** — a unique, secret path printed by the installer |

> The admin path is randomly generated and baked into the app. Keep it private — it's your "unique admin URL". You can change it later (see *Change the admin path*).

**How it fits together:** Docker runs everything (APIs, frontend SPA, Postfix, Dovecot, Rspamd, ClamAV, Postgres, Redis). The APIs and frontend are published **only on `127.0.0.1`** (3001, 3002, 8080). Host **Apache** owns ports 80/443, terminates TLS, and reverse-proxies to them.

---

## 0. Prerequisites (do these first)

1. **DNS A-record** for your mail domain → the VPS:
   ```
   mail.yourdomain.com.   A   88.222.215.20
   ```
2. **Reverse DNS (PTR)** — in the Hostinger VPS panel, set the PTR for `88.222.215.20` to the **same** domain. Important for deliverability.
3. **Port 25 outbound** — Hostinger often blocks SMTP port 25. Open a support ticket to unblock it (or plan an SMTP relay). Inbound mail works regardless.

---

## 1. Install Docker + Apache on the VPS

SSH in as root (or a sudo user):
```bash
ssh root@88.222.215.20
```

Install Docker Engine + Compose v2:
```bash
curl -fsSL https://get.docker.com | sh
docker compose version          # should print v2.x
```

Install Apache + certbot (if not already present):
```bash
apt update
apt install -y apache2 certbot python3-certbot-apache git
systemctl enable --now apache2
```

---

## 2. Open the firewall

```bash
ufw allow 22/tcp      # SSH (don't lock yourself out)
ufw allow 80/tcp      # HTTP (Let's Encrypt + redirect)
ufw allow 443/tcp     # HTTPS (webmail + admin)
ufw allow 25/tcp      # SMTP (inbound mail)
ufw allow 465/tcp     # SMTPS submission
ufw allow 587/tcp     # SMTP submission (STARTTLS)
ufw allow 993/tcp     # IMAPS
ufw allow 995/tcp     # POP3S
ufw allow 4190/tcp    # ManageSieve (filters)
ufw --force enable
```

---

## 3. Pull the code from GitHub

```bash
cd /opt
git clone https://github.com/orbittrainingpoint-a11y/ezmails.git
cd ezmails
```

To update later: `cd /opt/ezmails && git pull` (then rebuild — see *Maintenance*).

---

## 4. Run the installer

```bash
cd /opt/ezmails
bash scripts/install.sh
```

It will ask for:
- **Public domain** — e.g. `mail.yourdomain.com` (must resolve to 88.222.215.20)
- **Admin email** + **admin password** — your super-admin login
- *(optional)* a **reseller** and/or **customer** portal account — leave blank to skip

Then it will:
1. Generate all secrets + a **secret admin path** into `.env` (chmod 600).
2. Build the Docker images (the frontend bakes in the secret admin path).
3. Start Postgres + Redis, apply the schema, and **seed only the admin + any portal users you chose — no demo mailboxes**.
4. Start the whole stack on `127.0.0.1` (admin-api:3001, webmail-api:3002, frontend:8080).
5. Install the **Apache vhost** (`/etc/apache2/sites-available/ezmails.conf`), enable the needed modules (`proxy proxy_http proxy_wstunnel ssl headers rewrite`), and reload Apache.
6. Request a **Let's Encrypt certificate** with `certbot --apache` and switch the site to HTTPS.

At the end it prints your two URLs, including the **secret admin URL** — **save it**.

> If DNS isn't pointed yet, the site comes up on **http://** and certbot is skipped. Once the A-record resolves, finish TLS with:
> ```bash
> bash scripts/issue-cert.sh
> ```

---

## 5. Configure your mail domain (in the admin panel)

1. Open `https://<your-domain>/control-XXXXXXXXXX` and log in as admin.
2. **Add your domain.** The panel shows the DNS records to publish:
   - **MX** → your domain
   - **SPF** (`TXT`: `v=spf1 mx ~all`)
   - **DKIM** (`TXT`, generated per-domain)
   - **DMARC** (`TXT`: `v=DMARC1; p=quarantine; rua=...`)
3. Publish them and wait for propagation.
4. **Create mailboxes** in the panel. Each user logs into **webmail at `https://<your-domain>/`**.

---

## 6. Verify

```bash
cd /opt/ezmails
docker compose ps                       # all containers running/healthy
curl -sI http://127.0.0.1:8080/         # frontend responds
curl -s  http://127.0.0.1:3001/health   # admin-api ok
curl -s  http://127.0.0.1:3002/webmail-api/health   # webmail-api ok
apache2ctl -S                           # Apache sees the ezmails vhost
```
Then browse to `https://<your-domain>/` (webmail) and your secret admin URL.

---

## Maintenance

| Task | Command (in `/opt/ezmails`) |
|------|------|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f <service>` |
| **Update from GitHub** | `git pull && docker compose build && docker compose up -d` |
| Renew / fix TLS | `bash scripts/issue-cert.sh` |
| Apply DB schema changes | `docker compose run --rm admin-api npm run db:push` |
| Reload Apache | `systemctl reload apache2` |
| Stop the stack | `docker compose down` |

**Back up** Postgres regularly:
```bash
docker compose exec -T postgres pg_dump -U ezmails ezmails | gzip > backup-$(date +%F).sql.gz
```

### Change the admin path
Edit `ADMIN_BASE_PATH` in `.env` to a new `/secret-...` value, then rebuild the frontend:
```bash
docker compose build frontend && docker compose up -d frontend
```

### Auto-renew TLS
certbot's apt package installs a renewal timer automatically. To also refresh the mail
containers after a renewal, add a cron hook:
```bash
( crontab -l 2>/dev/null; echo "30 3 * * 1 cd /opt/ezmails && docker compose restart postfix dovecot" ) | crontab -
```

---

## Notes & limits

- **Edge proxy is host Apache** (not a container). The repo ships `config/apache/ezmails.conf`; the installer renders it to `/etc/apache2/sites-available/ezmails.conf`. The frontend container still uses its own internal nginx to serve static files — that's self-contained in Docker and unrelated to the host.
- **Database is PostgreSQL + Redis only**, self-hosted in Docker. Postfix & Dovecot read mail tables directly from the same Postgres.
- **No demo email users** are seeded. The only accounts after install are your admin (+ any portal users you chose). Create real mailboxes in the panel.
- **Mail TLS**: Postfix/Dovecot read the cert from the host's `/etc/letsencrypt` (mounted read-only), so the same Let's Encrypt cert certbot issues for Apache is reused for IMAPS/SMTPS.
- **Hostinger port 25**: if it stays blocked, configure an outbound **SMTP relay** in Postfix; inbound + internal mail are unaffected.

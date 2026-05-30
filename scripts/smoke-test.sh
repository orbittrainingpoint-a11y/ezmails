#!/usr/bin/env bash
# ezmails post-install smoke test — verifies the stack is healthy end to end.
set -u
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pass() { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m  ✗\033[0m %s\n' "$*"; FAILED=1; }
FAILED=0

echo "ezmails smoke test"

# 1. Containers running
for svc in postgres redis admin-api webmail-api frontend nginx postfix dovecot rspamd; do
  if docker compose ps "$svc" 2>/dev/null | grep -q "Up\|running"; then pass "$svc is running"; else fail "$svc is not running"; fi
done

# 2. PostgreSQL accepting connections
if docker compose exec -T postgres pg_isready -U ezmails >/dev/null 2>&1; then pass "PostgreSQL ready"; else fail "PostgreSQL not ready"; fi

# 3. Redis responding
if docker compose exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" ping' 2>/dev/null | grep -q PONG; then pass "Redis responding"; else fail "Redis not responding"; fi

# 4. API health endpoints (from inside the nginx container network)
if docker compose exec -T nginx wget -qO- http://admin-api:3001/health 2>/dev/null | grep -q ok; then pass "admin-api healthy"; else fail "admin-api health check failed"; fi
if docker compose exec -T nginx wget -qO- http://webmail-api:3002/webmail-api/health 2>/dev/null | grep -q ok; then pass "webmail-api healthy"; else fail "webmail-api health check failed"; fi

# 5. SMTP banner on port 25
if docker compose exec -T postfix sh -c 'echo QUIT | nc -w 3 localhost 25' 2>/dev/null | grep -q "220"; then pass "Postfix SMTP banner OK"; else fail "Postfix SMTP not responding"; fi

# 6. Node agent reachable
if docker compose exec -T admin-api wget -qO- --header="x-internal-token: ${INTERNAL_TOKEN:-}" http://postfix:9101/stats 2>/dev/null | grep -q cpu; then pass "node agent reachable"; else fail "node agent not reachable"; fi

[[ "$FAILED" -eq 0 ]] && echo "All checks passed." || { echo "Some checks failed — see 'docker compose logs'."; exit 1; }

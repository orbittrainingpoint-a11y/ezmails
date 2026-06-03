-- Runs once on first PostgreSQL container start (docker-entrypoint-initdb.d).
-- pgcrypto provides crypt()/gen_salt(), used by Dovecot's app-password passdb to
-- verify bcrypt app passwords inside the database (delegated verification mode).
-- For an already-initialised DB, run manually:
--   docker compose exec postgres psql -U ezmails -d ezmails -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

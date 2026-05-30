-- Runs once on first PostgreSQL container start (docker-entrypoint-initdb.d).
-- Creates a limited-privilege role that Postfix and Dovecot use to read mail
-- lookup data. The role is granted SELECT only — it can never mutate app data.
--
-- NOTE: the password here must match MAIL_DB_PASSWORD in .env. The installer
-- rewrites this line with the generated secret before bringing the stack up.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ezmails_mail') THEN
    CREATE ROLE ezmails_mail LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END
$$;

-- Allow the mail role to connect and read the public schema.
GRANT CONNECT ON DATABASE ezmails TO ezmails_mail;
GRANT USAGE ON SCHEMA public TO ezmails_mail;

-- Grant SELECT on existing and future tables (Prisma migrate creates them later;
-- default privileges ensure the grant applies once migrations run).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ezmails_mail;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ezmails_mail;

-- Dovecot needs to record last_login; allow UPDATE on that single column only.
-- (Applied again after migrations create the table — see 02-mail-grants.sql.)

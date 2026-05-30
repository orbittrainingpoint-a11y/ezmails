# ezmails Dovecot image — IMAP/POP3/LMTP/ManageSieve, auth + userdb via PostgreSQL.
FROM debian:12-slim

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      dovecot-core dovecot-imapd dovecot-pop3d dovecot-lmtpd \
      dovecot-managesieved dovecot-sieve dovecot-pgsql ca-certificates openssl && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -g 5000 vmail && useradd -g vmail -u 5000 vmail -d /var/mail/vhosts -m

COPY dovecot.conf /etc/dovecot/dovecot.conf
COPY dovecot-sql.conf.ext /etc/dovecot/dovecot-sql.conf.ext
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chmod 600 /etc/dovecot/dovecot-sql.conf.ext

EXPOSE 993 995 4190 24 12345
ENTRYPOINT ["/entrypoint.sh"]

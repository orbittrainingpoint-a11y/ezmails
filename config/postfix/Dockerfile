# ezmails Postfix image — virtual mailboxes via PostgreSQL, Rspamd milter, TLS,
# plus the lightweight node agent for queue/stats.
FROM debian:12-slim

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      postfix postfix-pgsql ca-certificates rsyslog procps nodejs openssl && \
    rm -rf /var/lib/apt/lists/*

COPY main.cf master.cf /etc/postfix/
COPY pgsql/ /etc/postfix/pgsql/
COPY entrypoint.sh /entrypoint.sh
COPY node-agent.mjs /usr/local/bin/node-agent.mjs
RUN chmod +x /entrypoint.sh

EXPOSE 25 465 587 9101
ENTRYPOINT ["/entrypoint.sh"]

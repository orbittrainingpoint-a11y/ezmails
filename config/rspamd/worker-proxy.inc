# Rspamd milter endpoint that Postfix talks to (smtpd_milters = inet:rspamd:11332).
milter = yes;
timeout = 120s;
upstream "local" {
  default = yes;
  self_scan = yes;
}
bind_socket = "*:11332";

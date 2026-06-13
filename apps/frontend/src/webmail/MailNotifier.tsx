import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { wmFolderCounts } from "./api";

/**
 * Desktop notifications for new mail while the webmail (or installed PWA) is open.
 * Watches the inbox unread count and fires a Notification when it rises. Enabled
 * via Settings → Notifications (stores `desktopNotify=1` + browser permission).
 */
export function MailNotifier() {
  const { data } = useQuery({ queryKey: ["wm", "counts"], queryFn: wmFolderCounts, refetchInterval: 30_000 });
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const unread = data["INBOX"]?.unread ?? 0;
    const enabled = localStorage.getItem("desktopNotify") === "1";
    const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
    if (enabled && granted && last.current !== null && unread > last.current && document.visibilityState !== "visible") {
      const n = unread - last.current;
      try {
        new Notification("Infinit Email", { body: `${n} new message${n > 1 ? "s" : ""} in your inbox.`, icon: "/icon.svg", tag: "new-mail" });
      } catch {
        /* notifications unsupported */
      }
    }
    last.current = unread;
  }, [data]);

  return null;
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, X } from "lucide-react";
import { listNotifications, dismissNotification, type Notification } from "./api";
import { useWebSocket } from "@/lib/useWebSocket";
import { Button } from "@/components/ui/Button";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";

const dot: Record<Notification["level"], string> = {
  info: "bg-primary",
  warning: "bg-warning",
  critical: "bg-danger",
};

export function NotificationBell() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => listNotifications(true), refetchInterval: 60_000 });

  // Live: refetch when an alert is pushed over the WebSocket.
  useWebSocket((ev) => {
    if (ev.event === "alert") qc.invalidateQueries({ queryKey: ["notifications"] });
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const count = data?.length ?? 0;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-border bg-surface shadow-md"
        >
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Notifications</div>
          <div className="max-h-80 overflow-auto">
            {count === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-text-secondary">You're all caught up.</p>
            ) : (
              data!.map((n) => (
                <div key={n.id} className="flex items-start gap-2 border-b border-border px-4 py-3 last:border-0">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot[n.level])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary">{n.message}</p>
                    <p className="text-xs text-text-secondary">{formatRelative(n.createdAt)}</p>
                  </div>
                  <button onClick={() => dismiss.mutate(n.id)} className="text-text-secondary hover:text-text-primary" aria-label="Dismiss">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

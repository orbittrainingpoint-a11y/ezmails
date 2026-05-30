import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Mail, AlertTriangle, ShieldX, ListChecks, Activity } from "lucide-react";
import { getDashboard, getVolume, getTopDomains, type Dashboard } from "./api";
import { useWebSocket } from "@/lib/useWebSocket";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatNumber } from "@/lib/format";

const cards = [
  { key: "delivered", label: "Delivered today", icon: Mail, to: "/logs?status=delivered" },
  { key: "bounced", label: "Bounced today", icon: AlertTriangle, to: "/logs?status=bounced" },
  { key: "spamBlocked", label: "Spam blocked", icon: ShieldX, to: "/spam" },
  { key: "queueDepth", label: "Queue depth", icon: ListChecks, to: "/queue" },
  { key: "activeConnections", label: "Active connections", icon: Activity, to: "/nodes" },
] as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: getDashboard, refetchInterval: 30_000 });
  const volume = useQuery({ queryKey: ["dashboard", "volume"], queryFn: getVolume });
  const top = useQuery({ queryKey: ["dashboard", "top"], queryFn: getTopDomains });

  // DASH-003: live updates via WebSocket (server pushes node:stats every 30s).
  useWebSocket((ev) => {
    if (ev.event === "node:stats") queryClient.setQueryData(["dashboard"], ev.data as Dashboard);
  });

  const counters = dash.data?.counters;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      {/* Metric cards (DASH-001/006) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <button key={c.key} onClick={() => navigate(c.to)} className="text-left">
            <Card className="transition-colors hover:border-primary">
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">{c.label}</span>
                  <c.icon className="h-4 w-4 text-text-secondary" />
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {counters ? formatNumber(counters[c.key]) : "—"}
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Node resource gauges (DASH-002) */}
      <Card>
        <CardHeader>
          <CardTitle>Mail nodes</CardTitle>
        </CardHeader>
        <CardContent>
          {dash.data && dash.data.nodes.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dash.data.nodes.map((n) => (
                <div key={n.nodeId} className="rounded-md border border-border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">{n.name}</span>
                    <Badge tone={n.available ? "success" : "danger"}>{n.available ? "online" : "offline"}</Badge>
                  </div>
                  {(["cpu", "ram", "disk"] as const).map((m) => (
                    <Gauge key={m} label={m.toUpperCase()} value={n[m]} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              No nodes reporting yet. Stats appear once a node agent is online (Phase 12).
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 7-day volume (DASH-004) */}
        <Card>
          <CardHeader>
            <CardTitle>Email volume (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={volume.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" stroke="var(--color-text-secondary)" fontSize={12} />
                <YAxis stroke="var(--color-text-secondary)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                />
                <Legend />
                <Bar dataKey="delivered" fill="var(--color-success)" />
                <Bar dataKey="bounced" fill="var(--color-warning)" />
                <Bar dataKey="spam" fill="var(--color-danger)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top domains by volume (DASH-005) */}
        <Card>
          <CardHeader>
            <CardTitle>Top domains by volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top.data?.byVolume ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" stroke="var(--color-text-secondary)" fontSize={12} />
                <YAxis type="category" dataKey="domain" width={120} stroke="var(--color-text-secondary)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="total" fill="var(--color-primary)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Gauge({ label, value }: { label: string; value: number }) {
  const tone = value >= 85 ? "var(--color-danger)" : value >= 70 ? "var(--color-warning)" : "var(--color-primary)";
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs text-text-secondary">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: tone }} />
      </div>
    </div>
  );
}

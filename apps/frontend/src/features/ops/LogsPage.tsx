import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { searchLogs, getTrace, exportLogsUrl, type LogFilters, type MailLogEntry } from "./api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { formatBytes, formatDate } from "@/lib/format";

const statusTone = { delivered: "success", bounced: "danger", deferred: "warning", rejected: "danger" } as const;

export function LogsPage() {
  const [filters, setFilters] = useState<LogFilters>({});
  const [draft, setDraft] = useState<LogFilters>({});
  const { data, isLoading } = useQuery({ queryKey: ["logs", filters], queryFn: () => searchLogs(filters) });

  async function download() {
    const csv = await exportLogsUrl(filters);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mail-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<MailLogEntry>[] = [
    { key: "createdAt", header: "Time", render: (l) => formatDate(l.createdAt) },
    { key: "sender", header: "Sender" },
    { key: "recipient", header: "Recipient" },
    { key: "status", header: "Status", render: (l) => <Badge tone={statusTone[l.status]}>{l.status}</Badge> },
    { key: "sizeBytes", header: "Size", render: (l) => (l.sizeBytes ? formatBytes(l.sizeBytes) : "—") },
    { key: "trace", header: "", className: "w-px", render: (l) => (l.queueId ? <TraceDialog queueId={l.queueId} /> : null) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Mail Log</h1>
        <Button variant="outline" onClick={download}><Download className="h-4 w-4" /> Export CSV</Button>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setFilters(draft); }}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-4"
      >
        <Input placeholder="Search…" onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))} className="max-w-xs" />
        <Input placeholder="Sender" onChange={(e) => setDraft((d) => ({ ...d, sender: e.target.value }))} className="max-w-[180px]" />
        <Input placeholder="Recipient" onChange={(e) => setDraft((d) => ({ ...d, recipient: e.target.value }))} className="max-w-[180px]" />
        <select
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
          onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value || undefined }))}
        >
          <option value="">All statuses</option>
          <option value="delivered">Delivered</option>
          <option value="bounced">Bounced</option>
          <option value="deferred">Deferred</option>
          <option value="rejected">Rejected</option>
        </select>
        <Button type="submit"><Search className="h-4 w-4" /> Search</Button>
      </form>

      <DataTable columns={columns} data={data?.items} isLoading={isLoading} rowKey={(l) => l.id} empty="No log entries." />
    </div>
  );
}

function TraceDialog({ queueId }: { queueId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["trace", queueId], queryFn: () => getTrace(queueId), enabled: false });
  return (
    <Dialog onOpenChange={(o) => o && qc.refetchQueries({ queryKey: ["trace", queueId] })}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Trace</Button>
      </DialogTrigger>
      <DialogContent title={`Delivery trace — ${queueId}`} className="max-w-2xl">
        <div className="max-h-96 space-y-2 overflow-auto">
          {data?.map((e) => (
            <div key={e.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{e.status}</span>
                <span className="text-xs text-text-secondary">{formatDate(e.createdAt)}</span>
              </div>
              <div className="mt-1 text-xs text-text-secondary">{e.sender} → {e.recipient}</div>
              {e.detail && <div className="mt-1 font-mono text-xs">{e.detail}</div>}
            </div>
          )) ?? <p className="text-sm text-text-secondary">No trace records.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

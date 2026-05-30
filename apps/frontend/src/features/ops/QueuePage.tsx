import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Trash2, Send } from "lucide-react";
import { getQueue, retryQueue, deleteQueue, flushQueue, type QueueItem } from "./api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { toast } from "@/components/ui/toast";
import { formatBytes, formatRelative } from "@/lib/format";

export function QueuePage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["queue"], queryFn: () => getQueue(), refetchInterval: 15_000 });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["queue"] });

  const retry = useMutation({ mutationFn: (i: QueueItem) => retryQueue(i.queueId, i.nodeId), onSuccess: () => { invalidate(); toast.success("Requeued."); } });
  const del = useMutation({ mutationFn: (i: QueueItem) => deleteQueue(i.queueId, i.nodeId), onSuccess: () => { invalidate(); toast.success("Removed."); } });
  const flush = useMutation({ mutationFn: () => flushQueue(), onSuccess: () => { invalidate(); toast.success("Queue flushed."); } });

  const columns: Column<QueueItem>[] = [
    { key: "queueId", header: "Queue ID", render: (i) => <span className="font-mono text-xs">{i.queueId}</span> },
    { key: "sender", header: "Sender" },
    { key: "recipient", header: "Recipient" },
    { key: "arrivalTime", header: "Queued", render: (i) => formatRelative(i.arrivalTime) },
    { key: "reason", header: "Reason", render: (i) => <span className="text-xs text-text-secondary">{i.reason}</span> },
    { key: "sizeBytes", header: "Size", render: (i) => formatBytes(i.sizeBytes) },
    {
      key: "actions",
      header: "",
      className: "w-px",
      render: (i) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => retry.mutate(i)} aria-label="Retry"><Send className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => del.mutate(i)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Mail Queue {data ? `(${data.depth})` : ""}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => invalidate()}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          <Button onClick={() => flush.mutate()} loading={flush.isPending}>Flush all</Button>
        </div>
      </div>
      {data && data.unavailableNodes.length > 0 && (
        <Alert tone="warning">Some nodes are unreachable: {data.unavailableNodes.join(", ")}. The node agent lands in Phase 12.</Alert>
      )}
      <DataTable columns={columns} data={data?.items} isLoading={isLoading} rowKey={(i) => `${i.nodeId}:${i.queueId}`} empty="Queue is empty." />
    </div>
  );
}

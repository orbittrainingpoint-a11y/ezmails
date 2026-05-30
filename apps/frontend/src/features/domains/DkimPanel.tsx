import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, RotateCw } from "lucide-react";
import { getDkim, rotateDkim, type DkimKey } from "./api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";

export function DkimPanel({ domainId }: { domainId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["domains", domainId, "dkim"], queryFn: () => getDkim(domainId) });

  const rotate = useMutation({
    mutationFn: () => rotateDkim(domainId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains", domainId, "dkim"] });
      qc.invalidateQueries({ queryKey: ["domains", domainId, "dns"] });
      toast.success("New DKIM key generated. Publish its DNS record, then the old key can be retired.");
    },
    onError: () => toast.error("Key rotation failed."),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          DKIM signs outbound mail. Rotating keeps the old key valid during a grace period.
        </p>
        <Button variant="outline" size="sm" onClick={() => rotate.mutate()} loading={rotate.isPending}>
          <RotateCw className="h-4 w-4" /> Rotate key
        </Button>
      </div>

      {isLoading && <p className="text-sm text-text-secondary">Loading keys…</p>}
      {data?.map((key: DkimKey) => (
        <div key={key.id} className="rounded-md border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-text-secondary" />
              <span className="font-mono text-sm">{key.selector}</span>
              {key.isActive && <Badge tone="success">Active</Badge>}
            </div>
            <span className="text-xs text-text-secondary">{formatDate(key.createdAt)}</span>
          </div>
          <div className="text-xs text-text-secondary">DNS host</div>
          <div className="mb-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-elevated px-2 py-1 text-xs font-mono">{key.dnsHostname}</code>
            <CopyButton value={key.dnsHostname} />
          </div>
          <div className="text-xs text-text-secondary">TXT value</div>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-elevated px-2 py-1 text-xs font-mono">{key.dnsValue}</code>
            <CopyButton value={key.dnsValue} />
          </div>
        </div>
      ))}
    </div>
  );
}

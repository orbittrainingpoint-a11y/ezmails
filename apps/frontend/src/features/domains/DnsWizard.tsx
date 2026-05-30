import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { getDns, validateDns, type DnsRecord, type DnsStatus } from "./api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { toast } from "@/components/ui/toast";

const statusTone: Record<DnsStatus, "success" | "danger" | "warning" | "neutral"> = {
  valid: "success",
  missing: "danger",
  incorrect: "danger",
  propagating: "warning",
  unchecked: "neutral",
};

export function DnsWizard({ domainId }: { domainId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["domains", domainId, "dns"], queryFn: () => getDns(domainId) });

  const revalidate = useMutation({
    mutationFn: () => validateDns(domainId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains", domainId, "dns"] });
      toast.success("DNS re-checked.");
    },
    onError: () => toast.error("Could not check DNS right now."),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Add these records at your DNS provider. Status refreshes on demand and every 15 minutes.
        </p>
        <Button variant="outline" size="sm" onClick={() => revalidate.mutate()} loading={revalidate.isPending}>
          <RefreshCw className="h-4 w-4" /> Re-check
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-text-secondary">Loading records…</p>}
        {data?.map((rec: DnsRecord) => (
          <div key={rec.id} className="rounded-md border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge tone="primary">{rec.recordType}</Badge>
                <Badge tone={statusTone[rec.status]}>{rec.status}</Badge>
              </div>
            </div>
            <Field label="Host / Name" value={rec.hostname ?? "@"} />
            <Field label="Value" value={rec.expectedValue} mono />
            {rec.status === "incorrect" && rec.actualValue && (
              <p className="mt-1 text-xs text-danger">Found: {rec.actualValue}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="text-xs text-text-secondary">{label}</div>
      <div className="flex items-start gap-2">
        <code className={`min-w-0 flex-1 break-all rounded bg-elevated px-2 py-1 text-xs ${mono ? "font-mono" : ""}`}>
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

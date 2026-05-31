import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send } from "lucide-react";
import { getDns, validateDns, sendDnsInstructions, type DnsRecord, type DnsStatus } from "./api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const revalidate = useMutation({
    mutationFn: () => validateDns(domainId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains", domainId, "dns"] });
      toast.success("DNS re-checked.");
    },
    onError: () => toast.error("Could not check DNS right now."),
  });

  const send = useMutation({
    mutationFn: () => sendDnsInstructions(domainId, email.trim(), note.trim() || undefined),
    onSuccess: () => { toast.success(`DNS instructions sent to ${email.trim()}.`); setEmail(""); setNote(""); },
    onError: () => toast.error("Could not send the email. Check the mail server is running."),
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

      {/* Email these DNS records to the domain owner / customer */}
      <div className="rounded-md border border-border bg-elevated p-4">
        <div className="mb-1 text-sm font-medium">Send these DNS settings to the domain owner</div>
        <p className="mb-3 text-xs text-text-secondary">
          Email the full list of records to whoever manages this domain’s DNS, so they can add them.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            placeholder="owner@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="sm:max-w-xs"
          />
          <Input
            placeholder="Optional note to include"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={() => send.mutate()}
            loading={send.isPending}
            disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}
          >
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
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

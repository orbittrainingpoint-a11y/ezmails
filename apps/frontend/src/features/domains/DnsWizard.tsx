import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Send, Wand2, Undo2, MailCheck } from "lucide-react";
import {
  getDns,
  validateDns,
  sendDnsInstructions,
  detectRegistrar,
  previewRegistrarSync,
  applyRegistrarSync,
  rollbackRegistrarSync,
  testDelivery,
  type DnsRecord,
  type DnsStatus,
  type Domain,
  type DnsSyncDiff,
} from "./api";
import { listMailboxes } from "@/features/mailboxes/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { CopyButton } from "@/components/ui/CopyButton";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";

const statusTone: Record<DnsStatus, "success" | "danger" | "warning" | "neutral"> = {
  valid: "success",
  missing: "danger",
  incorrect: "danger",
  propagating: "warning",
  unchecked: "neutral",
};

export function DnsWizard({ domain }: { domain: Domain }) {
  const domainId = domain.id;
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
      {domain.sourceType === "external" && (
        <Alert tone="info">
          This domain sends outbound mail through ezmails but receives inbound mail elsewhere — no MX record is
          needed here. Only the records below (SPF/DKIM/DMARC) apply.
        </Alert>
      )}

      <RegistrarAutoConfigure domainId={domainId} domainName={domain.domainName} />

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

      {domain.sourceType === "vps_hosted" && <DeliveryTestCard domain={domain} />}

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

/** DOM-021: preview → confirm → apply DNS changes at the registrar, with a one-click undo. */
function RegistrarAutoConfigure({ domainId, domainName }: { domainId: string; domainName: string }) {
  const qc = useQueryClient();
  const [diff, setDiff] = useState<DnsSyncDiff | null>(null);
  const [lastSnapshotId, setLastSnapshotId] = useState<string | null>(null);

  const detect = useQuery({
    queryKey: ["domains", domainId, "registrar-detect"],
    queryFn: () => detectRegistrar(domainId),
  });

  const preview = useMutation({
    mutationFn: () => previewRegistrarSync(domainId),
    onSuccess: setDiff,
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Could not reach the registrar. Check your connection in Settings."),
  });

  const apply = useMutation({
    mutationFn: () => applyRegistrarSync(domainId),
    onSuccess: (result) => {
      setLastSnapshotId(result.auditLogId);
      setDiff(null);
      qc.invalidateQueries({ queryKey: ["domains", domainId, "dns"] });
      toast.success(`DNS updated at your registrar for ${domainName}. Re-checking now.`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not apply changes."),
  });

  const rollback = useMutation({
    mutationFn: () => rollbackRegistrarSync(domainId, lastSnapshotId!),
    onSuccess: () => {
      setLastSnapshotId(null);
      qc.invalidateQueries({ queryKey: ["domains", domainId, "dns"] });
      toast.success("Reverted to the previous DNS records.");
    },
    onError: () => toast.error("Could not roll back."),
  });

  if (!detect.data?.registrar) return null; // no supported registrar detected — manual copy-paste below still works

  return (
    <div className="rounded-md border border-border bg-elevated p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
        <Wand2 className="h-4 w-4" /> Auto-configure DNS via Namecheap
      </div>
      <p className="mb-3 text-xs text-text-secondary">
        This domain's nameservers look like Namecheap. If you've connected your Namecheap API credentials in
        Settings, we can add/fix the records below for you — nothing else on the domain is touched.
      </p>

      {!diff ? (
        <Button variant="outline" size="sm" onClick={() => preview.mutate()} loading={preview.isPending}>
          Preview changes
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="success">{diff.toAdd.length} to add</Badge>
            <Badge tone="warning">{diff.toUpdate.length} to fix</Badge>
            <Badge tone="neutral">{diff.unchanged.length} already correct</Badge>
            <Badge tone="neutral">{diff.preserved.length} other records untouched</Badge>
          </div>
          {diff.toUpdate.length > 0 && (
            <div className="space-y-1 text-xs">
              {diff.toUpdate.map((u, i) => (
                <div key={i} className="rounded bg-surface p-2">
                  <span className="text-danger">− {u.before.address}</span>
                  <br />
                  <span className="text-success">+ {u.after.address}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => apply.mutate()} loading={apply.isPending}>
              Apply {diff.toAdd.length + diff.toUpdate.length} change(s)
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDiff(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {lastSnapshotId && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-text-secondary">Just applied a change.</span>
          <Button size="sm" variant="outline" onClick={() => rollback.mutate()} loading={rollback.isPending}>
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </Button>
        </div>
      )}
    </div>
  );
}

const stageLabel: Record<string, string> = {
  resolving_mx: "Resolving MX record…",
  connecting: "Connecting to your mail server…",
  sent: "Message accepted, waiting for delivery…",
  waiting_for_delivery: "Waiting for delivery confirmation…",
  passed: "Delivered successfully.",
  failed: "Delivery failed.",
  timeout: "No confirmation received in time.",
};

/** DOM-020: prove inbound delivery actually works, not just that DNS strings match. */
function DeliveryTestCard({ domain }: { domain: Domain }) {
  const domainId = domain.id;
  const [mailboxId, setMailboxId] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | undefined>();

  const mailboxes = useQuery({
    queryKey: ["domains", domainId, "mailboxes-for-test"],
    queryFn: () => listMailboxes(domainId),
  });

  useWebSocket((ev) => {
    if (ev.event !== "domain:delivery-test") return;
    const payload = ev.data as { domainId: string; stage: string; detail?: string };
    if (payload.domainId !== domainId) return;
    setStage(payload.stage);
    setDetail(payload.detail);
  });

  const start = useMutation({
    mutationFn: () => testDelivery(domainId, mailboxId),
    onSuccess: () => setStage("resolving_mx"),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not start the test."),
  });

  const finished = stage === "passed" || stage === "failed" || stage === "timeout";
  const tone = stage === "passed" ? "success" : stage === "failed" || stage === "timeout" ? "danger" : "warning";

  return (
    <div className="rounded-md border border-border bg-elevated p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
        <MailCheck className="h-4 w-4" /> Send a live test email
      </div>
      <p className="mb-3 text-xs text-text-secondary">
        Sends a real message from outside to a mailbox on this domain and confirms it actually arrives — catches
        problems (like MX pointing at the wrong server) that DNS checks alone can miss.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-sm sm:max-w-xs"
          value={mailboxId}
          onChange={(e) => setMailboxId(e.target.value)}
        >
          <option value="">Select a mailbox…</option>
          {mailboxes.data?.items.map((m) => (
            <option key={m.id} value={m.id}>
              {m.email}
            </option>
          ))}
        </select>
        <Button onClick={() => start.mutate()} loading={start.isPending} disabled={!mailboxId}>
          Send test email
        </Button>
      </div>
      {stage && (
        <div className="mt-3">
          <Alert tone={finished ? tone : "info"}>
            {stageLabel[stage] ?? stage}
            {detail && <div className="mt-1 text-xs opacity-90">{detail}</div>}
          </Alert>
        </div>
      )}
      {domain.lastDeliveryTestAt && !stage && (
        <p className="mt-2 text-xs text-text-secondary">
          Last tested {new Date(domain.lastDeliveryTestAt).toLocaleString()} —{" "}
          {domain.lastDeliveryTestStatus === "passed" ? "passed" : "did not pass"}.
        </p>
      )}
    </div>
  );
}

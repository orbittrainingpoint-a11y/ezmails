import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Upload, Trash2, BarChart3 } from "lucide-react";
import {
  wmCampaigns,
  wmCreateCampaign,
  wmDeleteCampaign,
  wmImportRecipients,
  wmSendCampaign,
  type Campaign,
} from "./api";
import { WmError } from "./api";
import { Card, CardContent } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/toast";

const statusTone = { draft: "neutral", sending: "warning", sent: "success", failed: "danger" } as const;

export function Campaigns() {
  const { data, isLoading } = useQuery({ queryKey: ["wm", "campaigns"], queryFn: wmCampaigns });

  const columns: Column<Campaign>[] = [
    { key: "name", header: "Campaign", render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "subject", header: "Subject", render: (c) => <span className="text-text-secondary">{c.subject}</span> },
    { key: "recipients", header: "Recipients", render: (c) => c.recipientCount ?? 0 },
    { key: "openRate", header: "Opens", render: (c) => (c.sent ? `${c.opened}/${c.sent} (${Math.round(((c.opened ?? 0) / c.sent) * 100)}%)` : "—") },
    { key: "status", header: "Status", render: (c) => <Badge tone={statusTone[c.status]}>{c.status}</Badge> },
    { key: "actions", header: "", className: "w-px", render: (c) => <CampaignActions campaign={c} /> },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Email Campaigns</h1>
          <p className="text-sm text-text-secondary">Send personalized bulk email with open tracking.</p>
        </div>
        <NewCampaignDialog />
      </div>
      <Card>
        <CardContent className="p-0">
          <DataTable columns={columns} data={data} isLoading={isLoading} rowKey={(c) => c.id} empty="No campaigns yet." />
        </CardContent>
      </Card>
    </div>
  );
}

function NewCampaignDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { register, handleSubmit, reset } = useForm<{ name: string; subject: string; bodyHtml: string }>();
  const create = useMutation({
    mutationFn: (v: { name: string; subject: string; bodyHtml: string }) => wmCreateCampaign(v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "campaigns"] }); toast.success("Campaign created."); reset(); setOpen(false); },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> New campaign</Button></DialogTrigger>
      <DialogContent title="New campaign" className="max-w-xl">
        <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-3">
          <div><Label htmlFor="cn">Name</Label><Input id="cn" {...register("name", { required: true })} /></div>
          <div><Label htmlFor="cs">Subject (supports {"{{name}}"})</Label><Input id="cs" {...register("subject", { required: true })} /></div>
          <div>
            <Label htmlFor="cb">Body HTML (supports {"{{name}}"}, {"{{email}}"} + CSV columns)</Label>
            <textarea id="cb" rows={8} className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs" {...register("bodyHtml")} />
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" loading={create.isPending}>Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CampaignActions({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["wm", "campaigns"] });

  const importMut = useMutation({
    mutationFn: () => wmImportRecipients(campaign.id, csv),
    onSuccess: (r) => { invalidate(); toast.success(`Imported ${r.imported} (skipped ${r.skipped}).`); setCsv(""); },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Import failed."),
  });
  const send = useMutation({
    mutationFn: () => wmSendCampaign(campaign.id),
    onSuccess: (r) => { invalidate(); toast.success(`Sent to ${r.sent}/${r.total}.`); },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Send failed."),
  });
  const remove = useMutation({ mutationFn: () => wmDeleteCampaign(campaign.id), onSuccess: () => { invalidate(); toast.success("Deleted."); } });

  return (
    <div className="flex justify-end gap-1">
      <Dialog>
        <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Recipients"><Upload className="h-4 w-4" /></Button></DialogTrigger>
        <DialogContent title="Import recipients" className="max-w-lg">
          <p className="mb-2 text-sm text-text-secondary">Paste CSV with an <code>email</code> column (plus <code>name</code> and any merge fields).</p>
          <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="email,name&#10;a@x.com,Alice" className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs" />
          <div className="mt-3 flex justify-end"><Button onClick={() => importMut.mutate()} loading={importMut.isPending} disabled={!csv.trim()}>Import</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Stats"><BarChart3 className="h-4 w-4" /></Button></DialogTrigger>
        <DialogContent title={`${campaign.name} — stats`}>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Recipients" value={campaign.recipientCount ?? 0} />
            <Stat label="Sent" value={campaign.sent ?? 0} />
            <Stat label="Opened" value={campaign.opened ?? 0} />
          </dl>
        </DialogContent>
      </Dialog>

      {campaign.status !== "sent" && (
        <Button variant="ghost" size="icon" onClick={() => send.mutate()} aria-label="Send" disabled={send.isPending}><Send className="h-4 w-4 text-primary" /></Button>
      )}
      <Button variant="ghost" size="icon" onClick={() => remove.mutate()} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-text-secondary">{label}</div>
    </div>
  );
}

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Trash2, Plus } from "lucide-react";
import {
  getThresholds,
  setThresholds,
  listAccessRules,
  createAccessRule,
  deleteAccessRule,
  getScoreDistribution,
  type Thresholds,
  type AccessRule,
} from "./api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/toast";

export function SpamPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Spam & Access Rules</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <ThresholdsCard />
        <ScoreCard />
      </div>
      <AccessRulesCard />
    </div>
  );
}

function ThresholdsCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["thresholds"], queryFn: getThresholds });
  const { register, handleSubmit, reset } = useForm<Thresholds>();
  useEffect(() => { if (data) reset(data); }, [data, reset]);

  const save = useMutation({
    mutationFn: (v: Thresholds) => setThresholds({ tag: Number(v.tag), greylist: Number(v.greylist), reject: Number(v.reject) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["thresholds"] }); toast.success("Thresholds saved."); },
  });

  return (
    <Card>
      <CardHeader><CardTitle>Rspamd score thresholds</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-3">
          <div><Label htmlFor="tag">Tag as spam ≥</Label><Input id="tag" type="number" step="0.1" {...register("tag")} /></div>
          <div><Label htmlFor="greylist">Greylist ≥</Label><Input id="greylist" type="number" step="0.1" {...register("greylist")} /></div>
          <div><Label htmlFor="reject">Reject ≥</Label><Input id="reject" type="number" step="0.1" {...register("reject")} /></div>
          <Button type="submit" loading={save.isPending}>Save</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ScoreCard() {
  const { data } = useQuery({ queryKey: ["spam", "scores"], queryFn: getScoreDistribution });
  return (
    <Card>
      <CardHeader><CardTitle>Score distribution (24h)</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="bucket" stroke="var(--color-text-secondary)" fontSize={12} />
            <YAxis stroke="var(--color-text-secondary)" fontSize={12} />
            <Tooltip contentStyle={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
            <Bar dataKey="count" fill="var(--color-secondary)" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function AccessRulesCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["access-rules"], queryFn: listAccessRules });
  const { register, handleSubmit, reset } = useForm<{ action: string; kind: string; value: string; note: string }>({
    defaultValues: { action: "deny", kind: "ip" },
  });

  const create = useMutation({
    mutationFn: (v: { action: string; kind: string; value: string; note: string }) => createAccessRule(v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["access-rules"] }); toast.success("Rule added."); reset({ action: "deny", kind: "ip" }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAccessRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["access-rules"] }),
  });

  const columns: Column<AccessRule>[] = [
    { key: "action", header: "Action", render: (r) => <Badge tone={r.action === "allow" ? "success" : "danger"}>{r.action}</Badge> },
    { key: "kind", header: "Type", render: (r) => r.kind },
    { key: "value", header: "Value", render: (r) => <span className="font-mono text-xs">{r.value}</span> },
    { key: "scope", header: "Scope", render: (r) => (r.domainId ? "domain" : "global") },
    {
      key: "actions",
      header: "",
      className: "w-px",
      render: (r) => <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)} aria-label="Delete rule"><Trash2 className="h-4 w-4 text-danger" /></Button>,
    },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>Allow / deny lists</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit((v) => create.mutate(v))} className="flex flex-wrap items-end gap-2">
          <select className="h-10 rounded-md border border-border bg-surface px-3 text-sm" {...register("action")}>
            <option value="deny">Deny</option>
            <option value="allow">Allow</option>
          </select>
          <select className="h-10 rounded-md border border-border bg-surface px-3 text-sm" {...register("kind")}>
            <option value="ip">IP</option>
            <option value="domain">Domain</option>
          </select>
          <Input placeholder="1.2.3.4 or spam.com" className="flex-1" {...register("value", { required: true })} />
          <Input placeholder="Note (optional)" className="max-w-[160px]" {...register("note")} />
          <Button type="submit" loading={create.isPending}><Plus className="h-4 w-4" /> Add</Button>
        </form>
        <DataTable columns={columns} data={data} isLoading={isLoading} rowKey={(r) => r.id} empty="No access rules." />
      </CardContent>
    </Card>
  );
}

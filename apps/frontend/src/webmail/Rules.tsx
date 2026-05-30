import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Play, Filter, X } from "lucide-react";
import { wmRules, wmCreateRule, wmDeleteRule, wmUpdateRule, wmApplyRules, wmFolders, type Rule } from "./api";
import { WmError } from "./api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/toast";

type Cond = { field: string; op: string; value: string };

export function Rules() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "rules"], queryFn: wmRules });

  const apply = useMutation({
    mutationFn: () => wmApplyRules("INBOX"),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["wm", "messages"] }); toast.success(`Rules applied — ${r.moved} message(s) moved.`); },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Could not run rules."),
  });
  const toggle = useMutation({
    mutationFn: (rule: Rule) => wmUpdateRule(rule.id, { enabled: !rule.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "rules"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => wmDeleteRule(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "rules"] }); toast.success("Rule deleted."); },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox Rules</h1>
          <p className="text-sm text-text-secondary">Automatically sort incoming mail into folders, Outlook-style.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => apply.mutate()} loading={apply.isPending}><Play className="h-4 w-4" /> Run now</Button>
          <NewRuleDialog />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Your rules</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data?.length === 0 && <p className="text-sm text-text-secondary">No rules yet. Create one to auto-file mail.</p>}
          {data?.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between rounded-md border border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <Filter className="h-4 w-4 text-text-secondary" />
                <div>
                  <div className="font-medium">{rule.name} {!rule.enabled && <Badge tone="neutral">off</Badge>}</div>
                  <div className="text-xs text-text-secondary">
                    Match {rule.matchType} · {rule.conditions.map((c) => `${c.field} ${c.op} "${c.value}"`).join(", ")} → <strong>{rule.targetFolder}</strong>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs"><input type="checkbox" className="accent-primary" checked={rule.enabled} onChange={() => toggle.mutate(rule)} /></label>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(rule.id)} aria-label="Delete rule"><Trash2 className="h-4 w-4 text-danger" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function NewRuleDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ["wm", "folders"], queryFn: wmFolders });
  const [name, setName] = useState("");
  const [matchType, setMatchType] = useState<"all" | "any">("all");
  const [targetFolder, setTargetFolder] = useState("");
  const [markRead, setMarkRead] = useState(false);
  const [conditions, setConditions] = useState<Cond[]>([{ field: "from", op: "contains", value: "" }]);

  const create = useMutation({
    mutationFn: () => wmCreateRule({ name, matchType, targetFolder, markRead, conditions: conditions.filter((c) => c.value.trim()) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "rules"] }); toast.success("Rule created."); setOpen(false); setName(""); setConditions([{ field: "from", op: "contains", value: "" }]); },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Failed."),
  });

  const setCond = (i: number, patch: Partial<Cond>) => setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> New rule</Button></DialogTrigger>
      <DialogContent title="New inbox rule" className="max-w-lg">
        <div className="space-y-4">
          <div><Label htmlFor="rn">Rule name</Label><Input id="rn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Newsletters → Reading" /></div>

          <div>
            <Label>Match {" "}
              <select value={matchType} onChange={(e) => setMatchType(e.target.value as "all" | "any")} className="ml-1 rounded border border-border bg-surface px-2 py-1 text-sm">
                <option value="all">all</option>
                <option value="any">any</option>
              </select> of these conditions
            </Label>
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-1">
                  <select value={c.field} onChange={(e) => setCond(i, { field: e.target.value })} className="rounded border border-border bg-surface px-2 py-1.5 text-sm">
                    <option value="from">From</option><option value="to">To</option><option value="subject">Subject</option><option value="body">Body</option>
                  </select>
                  <select value={c.op} onChange={(e) => setCond(i, { op: e.target.value })} className="rounded border border-border bg-surface px-2 py-1.5 text-sm">
                    <option value="contains">contains</option><option value="equals">equals</option><option value="startsWith">starts with</option>
                  </select>
                  <Input value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} className="h-8 flex-1" placeholder="value" />
                  {conditions.length > 1 && <button onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))} aria-label="Remove"><X className="h-4 w-4 text-text-secondary" /></button>}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setConditions((cs) => [...cs, { field: "from", op: "contains", value: "" }])}><Plus className="h-4 w-4" /> Add condition</Button>
            </div>
          </div>

          <div>
            <Label htmlFor="tf">Move to folder</Label>
            <select id="tf" value={targetFolder} onChange={(e) => setTargetFolder(e.target.value)} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm">
              <option value="">Select folder…</option>
              {folders.data?.filter((f) => f.path.toUpperCase() !== "INBOX").map((f) => <option key={f.path} value={f.path}>{f.name}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={markRead} onChange={(e) => setMarkRead(e.target.checked)} /> Mark as read</label>

          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim() || !targetFolder}>Create rule</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

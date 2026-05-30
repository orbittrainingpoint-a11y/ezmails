import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Server, Trash2 } from "lucide-react";
import { listNodes, registerNode, decommissionNode, type NodeRow } from "./api";
import { ApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";

export function NodesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["nodes"], queryFn: listNodes, refetchInterval: 30_000 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Mail Nodes</h1>
        <RegisterNodeDialog />
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-text-secondary">
              No nodes registered. The bundled mail stack registers automatically during install (Phase 12).
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((n) => (
            <NodeCard key={n.id} node={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeCard({ node }: { node: NodeRow }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => decommissionNode(node.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nodes"] });
      toast.success("Node decommissioned.");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed."),
  });

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-text-secondary" />
            <span className="font-medium">{node.name}</span>
          </div>
          <Badge tone={node.available ? "success" : "danger"}>{node.available ? "online" : "offline"}</Badge>
        </div>
        <div className="space-y-1 text-xs text-text-secondary">
          <div>{node.hostname}</div>
          <div>{node.ipAddress} · {node.domains} domain(s)</div>
        </div>
        {node.stats && (
          <div className="mt-3 space-y-2">
            {(["cpu", "ram", "disk"] as const).map((m) => (
              <div key={m}>
                <div className="flex justify-between text-xs text-text-secondary">
                  <span>{m.toUpperCase()}</span>
                  <span>{Math.round(node.stats![m])}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-elevated">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, node.stats![m])}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => remove.mutate()} loading={remove.isPending}>
            <Trash2 className="h-4 w-4 text-danger" /> Decommission
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RegisterNodeDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { register, handleSubmit, reset } = useForm<{ name: string; hostname: string; ipAddress: string; sshPort?: number }>();

  const mutation = useMutation({
    mutationFn: (v: { name: string; hostname: string; ipAddress: string; sshPort?: number }) =>
      registerNode({ ...v, sshPort: v.sshPort ? Number(v.sshPort) : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nodes"] });
      toast.success("Node registered.");
      reset();
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> Register node</Button>
      </DialogTrigger>
      <DialogContent title="Register mail node">
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          {mutation.error && <Alert tone="danger">{mutation.error instanceof ApiError ? mutation.error.message : "Error"}</Alert>}
          <div><Label htmlFor="name">Name</Label><Input id="name" autoFocus {...register("name", { required: true })} /></div>
          <div><Label htmlFor="hostname">Hostname</Label><Input id="hostname" placeholder="mail-02.example.com" {...register("hostname", { required: true })} /></div>
          <div><Label htmlFor="ipAddress">IP address</Label><Input id="ipAddress" placeholder="203.0.113.10" {...register("ipAddress", { required: true })} /></div>
          <div><Label htmlFor="sshPort">SSH port</Label><Input id="sshPort" type="number" placeholder="22" {...register("sshPort")} /></div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" loading={mutation.isPending}>Register</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

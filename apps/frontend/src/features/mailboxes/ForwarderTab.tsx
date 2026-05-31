import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { listForwarders, createForwarder, deleteForwarder, type Forwarder } from "./api";
import { ApiError } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/toast";

export function ForwarderTab({ domainId }: { domainId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["forwarders", domainId], queryFn: () => listForwarders(domainId) });
  const { register, handleSubmit, reset } = useForm<{ source: string; destination: string; keepCopy: boolean }>();

  const create = useMutation({
    mutationFn: (v: { source: string; destination: string; keepCopy: boolean }) => createForwarder(domainId, v),
    onSuccess: (_data) => {
      qc.invalidateQueries({ queryKey: ["forwarders", domainId] });
      toast.success("Forwarder created.");
      reset();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteForwarder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forwarders", domainId] }),
  });

  const columns: Column<Forwarder>[] = [
    { key: "source", header: "From", render: (f) => <span className="font-medium">{f.source}</span> },
    { key: "destination", header: "Forwards to", render: (f) => <span className="font-mono text-xs">{f.destination}</span> },
    { key: "keepCopy", header: "Keep copy", render: (f) => (f.keepCopy ? <Badge tone="primary">yes</Badge> : "no") },
    {
      key: "actions",
      header: "",
      className: "w-px",
      render: (f) => (
        <Button variant="ghost" size="icon" onClick={() => remove.mutate(f.id)} aria-label="Delete forwarder">
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit((v) => create.mutate(v))} className="flex flex-wrap items-end gap-2">
        <Input placeholder="info" className="max-w-[160px]" {...register("source", { required: true })} />
        <Input placeholder="external@gmail.com" className="flex-1" {...register("destination", { required: true })} />
        <label className="flex items-center gap-1 text-sm text-text-secondary">
          <input type="checkbox" className="accent-primary" {...register("keepCopy")} /> Keep copy
        </label>
        <Button type="submit" loading={create.isPending}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
      <DataTable columns={columns} data={data} isLoading={isLoading} rowKey={(f) => f.id} empty="No forwarders." />
    </div>
  );
}

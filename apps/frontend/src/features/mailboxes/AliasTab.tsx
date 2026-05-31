import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { listAliases, createAlias, deleteAlias, type Alias } from "./api";
import { ApiError } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/toast";

export function AliasTab({ domainId }: { domainId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["aliases", domainId], queryFn: () => listAliases(domainId) });
  const { register, handleSubmit, reset, watch } = useForm<{ source: string; destination: string; isWildcard: boolean }>();

  const create = useMutation({
    mutationFn: (v: { source: string; destination: string; isWildcard: boolean }) => createAlias(domainId, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aliases", domainId] });
      toast.success("Alias created.");
      reset();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAlias(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aliases", domainId] }),
  });

  const columns: Column<Alias>[] = [
    {
      key: "source",
      header: "Alias",
      render: (a) => (
        <span className="font-medium">
          {a.source} {a.isWildcard && <Badge tone="primary">wildcard</Badge>}
        </span>
      ),
    },
    { key: "destination", header: "Routes to", render: (a) => <span className="font-mono text-xs">{a.destination}</span> },
    {
      key: "actions",
      header: "",
      className: "w-px",
      render: (a) => (
        <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)} aria-label="Delete alias">
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit((v) => create.mutate(v))} className="flex flex-wrap items-end gap-2">
        <Input placeholder={watch("isWildcard") ? "(wildcard)" : "sales"} className="max-w-[160px]" {...register("source")} />
        <Input placeholder="dest1@x.com, dest2@y.com" className="flex-1" {...register("destination", { required: true })} />
        <label className="flex items-center gap-1 text-sm text-text-secondary">
          <input type="checkbox" className="accent-primary" {...register("isWildcard")} /> Wildcard
        </label>
        <Button type="submit" loading={create.isPending}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
      <DataTable columns={columns} data={data} isLoading={isLoading} rowKey={(a) => a.id} empty="No aliases." />
    </div>
  );
}

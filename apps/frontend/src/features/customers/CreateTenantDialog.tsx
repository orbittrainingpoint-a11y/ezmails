import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { createCustomer, createReseller } from "./api";
import { ApiError } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";

interface Form {
  name: string;
  email: string;
  password: string;
  maxCustomers?: number;
  maxDomains?: number;
  storagePoolGb?: number;
}

const GB = 1024 * 1024 * 1024;

export function CreateTenantDialog({ kind }: { kind: "customer" | "reseller" }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { register, handleSubmit, reset } = useForm<Form>();
  const isReseller = kind === "reseller";

  const mutation = useMutation({
    mutationFn: (v: Form) => {
      const base = { name: v.name, email: v.email, password: v.password };
      return isReseller
        ? createReseller({
            ...base,
            maxCustomers: v.maxCustomers ? Number(v.maxCustomers) : undefined,
            maxDomains: v.maxDomains ? Number(v.maxDomains) : undefined,
            storagePool: v.storagePoolGb ? String(BigInt(Math.round(v.storagePoolGb * GB))) : undefined,
          })
        : createCustomer(base);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [isReseller ? "resellers" : "customers"] });
      toast.success(`${isReseller ? "Reseller" : "Customer"} created.`);
      reset();
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New {kind}
        </Button>
      </DialogTrigger>
      <DialogContent title={`Create ${kind}`}>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          {mutation.error && (
            <Alert tone="danger">{mutation.error instanceof ApiError ? mutation.error.message : "Error"}</Alert>
          )}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" autoFocus {...register("name", { required: true })} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email", { required: true })} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password", { required: true, minLength: 8 })} />
          </div>
          {isReseller && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="maxCustomers">Max customers</Label>
                <Input id="maxCustomers" type="number" {...register("maxCustomers")} />
              </div>
              <div>
                <Label htmlFor="maxDomains">Max domains</Label>
                <Input id="maxDomains" type="number" {...register("maxDomains")} />
              </div>
              <div>
                <Label htmlFor="storagePoolGb">Pool (GB)</Label>
                <Input id="storagePoolGb" type="number" {...register("storagePoolGb")} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={mutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

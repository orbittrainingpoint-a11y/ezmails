import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { createDomain } from "./api";
import { createDomainFormSchema, type CreateDomainForm } from "./schemas";
import { ApiError } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";

export function CreateDomainDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState } = useForm<CreateDomainForm>({
    resolver: zodResolver(createDomainFormSchema),
    defaultValues: { sourceType: "vps_hosted", domainName: "" },
  });

  const mutation = useMutation({
    mutationFn: createDomain,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      toast.success("Domain added. Configure its DNS records next.");
      reset();
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to add domain."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Add domain
        </Button>
      </DialogTrigger>
      <DialogContent title="Add a domain">
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          {mutation.error && (
            <Alert tone="danger">{mutation.error instanceof ApiError ? mutation.error.message : "Error"}</Alert>
          )}
          <div>
            <Label htmlFor="domainName">Domain name</Label>
            <Input id="domainName" placeholder="example.com" autoFocus {...register("domainName")} />
            {formState.errors.domainName && (
              <p className="mt-1 text-xs text-danger">{formState.errors.domainName.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="sourceType">Source</Label>
            <select
              id="sourceType"
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
              {...register("sourceType")}
            >
              <option value="vps_hosted">VPS-hosted (receive mail here)</option>
              <option value="external">External (send only — inbound stays elsewhere)</option>
            </select>
            <p className="mt-1 text-xs text-text-secondary">
              VPS-hosted domains get an MX record pointing here. External domains only need SPF/DKIM/DMARC to
              authenticate outbound mail — no MX change is required.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={mutation.isPending}>
              Add domain
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { updateDomain, suspendDomain, unsuspendDomain, deleteDomain, type Domain } from "./api";
import { domainSettingsFormSchema, type DomainSettingsForm } from "./schemas";
import { ApiError } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Dialog, DialogContent, DialogClose, DialogTrigger } from "@/components/ui/Dialog";

export function DomainSettings({ domain }: { domain: Domain }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { register, handleSubmit, formState } = useForm<DomainSettingsForm>({
    resolver: zodResolver(domainSettingsFormSchema),
    defaultValues: {
      sourceType: domain.sourceType,
      maxMailboxes: domain.maxMailboxes,
      storageQuota: domain.storageQuota,
      sendRate: domain.sendRate,
      catchAll: domain.catchAll ?? "",
      webmailEnabled: domain.webmailEnabled,
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["domains", domain.id] });
    qc.invalidateQueries({ queryKey: ["domains"] });
  };

  const save = useMutation({
    mutationFn: (v: DomainSettingsForm) =>
      updateDomain(domain.id, {
        sourceType: v.sourceType,
        maxMailboxes: v.maxMailboxes,
        storageQuota: v.storageQuota,
        sendRate: v.sendRate,
        catchAll: v.catchAll || null,
        webmailEnabled: v.webmailEnabled,
      }),
    onSuccess: (_, v) => {
      invalidate();
      toast.success(
        v.sourceType !== domain.sourceType
          ? "Domain settings saved — DNS requirements updated and re-checking now."
          : "Domain settings saved.",
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Save failed."),
  });

  const toggleSuspend = useMutation({
    mutationFn: () => (domain.isActive ? suspendDomain(domain.id) : unsuspendDomain(domain.id)),
    onSuccess: () => {
      invalidate();
      toast.success(domain.isActive ? "Domain suspended." : "Domain reactivated.");
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteDomain(domain.id),
    onSuccess: () => {
      toast.success("Domain deleted.");
      navigate("/domains");
    },
  });

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
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
            Changing this updates the domain's required DNS records and re-checks them immediately.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="maxMailboxes">Max mailboxes</Label>
            <Input id="maxMailboxes" type="number" {...register("maxMailboxes")} />
            {formState.errors.maxMailboxes && (
              <p className="mt-1 text-xs text-danger">{formState.errors.maxMailboxes.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="sendRate">Send rate (msgs/hour)</Label>
            <Input id="sendRate" type="number" {...register("sendRate")} />
            {formState.errors.sendRate && <p className="mt-1 text-xs text-danger">{formState.errors.sendRate.message}</p>}
          </div>
        </div>
        <div>
          <Label htmlFor="storageQuota">Storage quota (bytes)</Label>
          <Input id="storageQuota" {...register("storageQuota")} />
        </div>
        <div>
          <Label htmlFor="catchAll">Catch-all address</Label>
          <Input id="catchAll" placeholder="catch@example.com (optional)" {...register("catchAll")} />
          {formState.errors.catchAll && <p className="mt-1 text-xs text-danger">{formState.errors.catchAll.message}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-primary" {...register("webmailEnabled")} />
          Webmail access enabled
        </label>
        <Button type="submit" loading={save.isPending}>
          Save settings
        </Button>
      </form>

      <div className="rounded-md border border-border p-4">
        <h3 className="mb-3 text-sm font-semibold">Danger zone</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => toggleSuspend.mutate()} loading={toggleSuspend.isPending}>
            {domain.isActive ? "Suspend domain" : "Reactivate domain"}
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="danger">Delete domain</Button>
            </DialogTrigger>
            <DialogContent title="Delete this domain?">
              <p className="text-sm text-text-secondary">
                Deleting <strong>{domain.domainName}</strong> permanently removes its{" "}
                {domain._count?.mailboxes ?? 0} mailbox(es), aliases, forwarders, DNS records, and DKIM keys.
                This cannot be undone.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending}>
                  Delete permanently
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

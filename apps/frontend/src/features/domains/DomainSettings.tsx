import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { updateDomain, suspendDomain, unsuspendDomain, deleteDomain, type Domain } from "./api";
import { ApiError } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Dialog, DialogContent, DialogClose, DialogTrigger } from "@/components/ui/Dialog";

interface SettingsForm {
  maxMailboxes: number;
  storageQuota: string;
  sendRate: number;
  catchAll: string;
  webmailEnabled: boolean;
}

export function DomainSettings({ domain }: { domain: Domain }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { register, handleSubmit } = useForm<SettingsForm>({
    defaultValues: {
      maxMailboxes: domain.maxMailboxes,
      storageQuota: domain.storageQuota,
      sendRate: domain.sendRate,
      catchAll: domain.catchAll ?? "",
      webmailEnabled: domain.webmailEnabled,
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["domains", domain.id] });

  const save = useMutation({
    mutationFn: (v: SettingsForm) =>
      updateDomain(domain.id, {
        maxMailboxes: Number(v.maxMailboxes),
        storageQuota: v.storageQuota,
        sendRate: Number(v.sendRate),
        catchAll: v.catchAll || null,
        webmailEnabled: v.webmailEnabled,
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Domain settings saved.");
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="maxMailboxes">Max mailboxes</Label>
            <Input id="maxMailboxes" type="number" {...register("maxMailboxes")} />
          </div>
          <div>
            <Label htmlFor="sendRate">Send rate (msgs/hour)</Label>
            <Input id="sendRate" type="number" {...register("sendRate")} />
          </div>
        </div>
        <div>
          <Label htmlFor="storageQuota">Storage quota (bytes)</Label>
          <Input id="storageQuota" {...register("storageQuota")} />
        </div>
        <div>
          <Label htmlFor="catchAll">Catch-all address</Label>
          <Input id="catchAll" placeholder="catch@example.com (optional)" {...register("catchAll")} />
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

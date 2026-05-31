import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { createMailbox } from "./api";
import { ApiError } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";

interface Form {
  localPart: string;
  displayName: string;
  password: string;
  quotaGb: number;
}

function strength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return { score, label: ["Very weak", "Weak", "Fair", "Good", "Strong", "Excellent"][score] ?? "" };
}

export function CreateMailboxDialog({ domainId }: { domainId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { register, handleSubmit, watch, reset } = useForm<Form>({ defaultValues: { quotaGb: 1 } });
  const pw = watch("password") ?? "";
  const s = strength(pw);

  const mutation = useMutation({
    mutationFn: (v: Form) =>
      createMailbox(domainId, {
        localPart: v.localPart,
        displayName: v.displayName || undefined,
        password: v.password,
        quota: String(BigInt(Math.round(v.quotaGb * 1024 * 1024 * 1024))),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mailboxes", domainId] });
      toast.success("Mailbox created.");
      reset({ quotaGb: 1 });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to create mailbox."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New mailbox
        </Button>
      </DialogTrigger>
      <DialogContent title="Create mailbox">
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          {mutation.error && (
            <Alert tone="danger">{mutation.error instanceof ApiError ? mutation.error.message : "Error"}</Alert>
          )}
          <div>
            <Label htmlFor="localPart">Address (local part)</Label>
            <Input id="localPart" placeholder="john" autoFocus {...register("localPart", { required: true })} />
          </div>
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" placeholder="John Doe" {...register("displayName")} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password", { required: true, minLength: 8 })} />
            {pw && (
              <div className="mt-1.5">
                <div className="h-1 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(s.score / 5) * 100}%`,
                      background: s.score >= 4 ? "var(--color-success)" : s.score >= 2 ? "var(--color-warning)" : "var(--color-danger)",
                    }}
                  />
                </div>
                <span className="text-xs text-text-secondary">{s.label}</span>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="quotaGb">Quota (GB)</Label>
            <Input id="quotaGb" type="number" step="0.5" min="0.5" {...register("quotaGb", { valueAsNumber: true })} />
          </div>
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

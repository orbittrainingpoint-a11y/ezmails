import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, User } from "lucide-react";
import { wmContacts, wmCreateContact, wmDeleteContact } from "./api";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";

export function Contacts() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "contacts"], queryFn: wmContacts });
  const { register, handleSubmit, reset } = useForm<{ name: string; email: string; phone: string }>();

  const create = useMutation({
    mutationFn: (v: { name: string; email: string; phone: string }) =>
      wmCreateContact({ name: v.name, emails: [v.email], phone: v.phone || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "contacts"] }); toast.success("Contact added."); reset(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => wmDeleteContact(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "contacts"] }),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
      <Card>
        <CardContent>
          <form onSubmit={handleSubmit((v) => create.mutate(v))} className="flex flex-wrap items-end gap-2">
            <Input placeholder="Name" className="flex-1" {...register("name", { required: true })} />
            <Input placeholder="Email" type="email" className="flex-1" {...register("email", { required: true })} />
            <Input placeholder="Phone" className="max-w-[140px]" {...register("phone")} />
            <Button type="submit" loading={create.isPending}><Plus className="h-4 w-4" /> Add</Button>
          </form>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {data?.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-elevated"><User className="h-4 w-4" /></div>
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-text-secondary">{c.emails.join(", ")}</div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove.mutate(c.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-danger" /></Button>
          </div>
        ))}
        {data?.length === 0 && <p className="text-center text-sm text-text-secondary">No contacts yet.</p>}
      </div>
    </div>
  );
}

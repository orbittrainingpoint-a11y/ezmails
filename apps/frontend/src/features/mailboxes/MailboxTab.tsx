import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Ban, Play, Trash2 } from "lucide-react";
import {
  listMailboxes,
  setMailboxSuspended,
  deleteMailbox,
  resetMailboxPassword,
  type Mailbox,
} from "./api";
import { CreateMailboxDialog } from "./CreateMailboxDialog";
import { ImportDialog } from "./ImportDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogClose, DialogTrigger } from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { toast } from "@/components/ui/toast";
import { formatBytes, formatRelative } from "@/lib/format";

export function MailboxTab({ domainId }: { domainId: string }) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["mailboxes", domainId, { search }],
    queryFn: () => listMailboxes(domainId, { search }),
  });

  const columns: Column<Mailbox>[] = [
    { key: "email", header: "Address", render: (m) => <span className="font-medium">{m.email}</span> },
    { key: "displayName", header: "Name", render: (m) => m.displayName ?? "—" },
    { key: "quota", header: "Quota", render: (m) => formatBytes(m.quota) },
    { key: "lastLoginAt", header: "Last login", render: (m) => formatRelative(m.lastLoginAt) },
    {
      key: "status",
      header: "Status",
      render: (m) => (m.status === "active" ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>),
    },
    { key: "actions", header: "", className: "w-px", render: (m) => <RowActions mailbox={m} domainId={domainId} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input placeholder="Search mailboxes…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <div className="flex gap-2">
          <ImportDialog domainId={domainId} />
          <CreateMailboxDialog domainId={domainId} />
        </div>
      </div>
      <DataTable columns={columns} data={data?.items} isLoading={isLoading} rowKey={(m) => m.id} empty="No mailboxes yet." />
    </div>
  );
}

function RowActions({ mailbox, domainId }: { mailbox: Mailbox; domainId: string }) {
  const qc = useQueryClient();
  const [newPw, setNewPw] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["mailboxes", domainId] });

  const suspend = useMutation({
    mutationFn: () => setMailboxSuspended(mailbox.id, mailbox.status === "active"),
    onSuccess: () => {
      invalidate();
      toast.success(mailbox.status === "active" ? "Mailbox suspended." : "Mailbox reactivated.");
    },
  });
  const reset = useMutation({
    mutationFn: () => resetMailboxPassword(mailbox.id, newPw),
    onSuccess: () => {
      toast.success("Password reset.");
      setNewPw("");
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteMailbox(mailbox.id),
    onSuccess: () => {
      invalidate();
      toast.success("Mailbox deleted.");
    },
  });

  return (
    <div className="flex justify-end gap-1">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Reset password">
            <KeyRound className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent title={`Reset password — ${mailbox.email}`}>
          <Label htmlFor="np">New password</Label>
          <Input id="np" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={() => reset.mutate()} loading={reset.isPending} disabled={newPw.length < 8}>
              Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Button variant="ghost" size="icon" onClick={() => suspend.mutate()} aria-label="Toggle suspend">
        {mailbox.status === "active" ? <Ban className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Delete">
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </DialogTrigger>
        <DialogContent title={`Delete ${mailbox.email}?`}>
          <p className="text-sm text-text-secondary">This permanently deletes the mailbox and its stored mail.</p>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

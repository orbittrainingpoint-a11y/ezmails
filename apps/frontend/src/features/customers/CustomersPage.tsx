import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Play, Trash2, BarChart3 } from "lucide-react";
import {
  listCustomers,
  listResellers,
  setCustomerSuspended,
  deleteCustomer,
  getCustomerUsage,
  getResellerUsage,
  type Tenant,
} from "./api";
import { CreateTenantDialog } from "./CreateTenantDialog";
import { useAuth } from "@/stores/auth";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/toast";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";

export function CustomersPage() {
  const role = useAuth((s) => s.user?.role);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          {role === "super_admin" && <TabsTrigger value="resellers">Resellers</TabsTrigger>}
        </TabsList>
        <TabsContent value="customers">
          <CustomerList />
        </TabsContent>
        {role === "super_admin" && (
          <TabsContent value="resellers">
            <ResellerList />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function CustomerList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["customers"], queryFn: listCustomers });

  const suspend = useMutation({
    mutationFn: (t: Tenant) => setCustomerSuspended(t.id, t.isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Updated.");
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer deleted.");
    },
  });

  const columns: Column<Tenant>[] = [
    { key: "displayName", header: "Name", render: (t) => <span className="font-medium">{t.displayName ?? "—"}</span> },
    { key: "email", header: "Email" },
    { key: "status", header: "Status", render: (t) => (t.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>) },
    { key: "createdAt", header: "Created", render: (t) => formatDate(t.createdAt) },
    {
      key: "actions",
      header: "",
      className: "w-px",
      render: (t) => (
        <div className="flex justify-end gap-1">
          <UsageDialog id={t.id} kind="customer" />
          <Button variant="ghost" size="icon" onClick={() => suspend.mutate(t)} aria-label="Toggle suspend">
            {t.isActive ? <Ban className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => remove.mutate(t.id)} aria-label="Delete">
            <Trash2 className="h-4 w-4 text-danger" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateTenantDialog kind="customer" />
      </div>
      <DataTable columns={columns} data={data} isLoading={isLoading} rowKey={(t) => t.id} empty="No customers yet." />
    </div>
  );
}

function ResellerList() {
  const { data, isLoading } = useQuery({ queryKey: ["resellers"], queryFn: listResellers });
  const columns: Column<Tenant>[] = [
    { key: "displayName", header: "Name", render: (t) => <span className="font-medium">{t.displayName ?? "—"}</span> },
    { key: "email", header: "Email" },
    { key: "maxCustomers", header: "Max customers", render: (t) => t.maxCustomers ?? "∞" },
    { key: "storagePool", header: "Storage pool", render: (t) => (t.storagePool ? formatBytes(t.storagePool) : "∞") },
    {
      key: "actions",
      header: "",
      className: "w-px",
      render: (t) => <UsageDialog id={t.id} kind="reseller" />,
    },
  ];
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateTenantDialog kind="reseller" />
      </div>
      <DataTable columns={columns} data={data} isLoading={isLoading} rowKey={(t) => t.id} empty="No resellers yet." />
    </div>
  );
}

function UsageDialog({ id, kind }: { id: string; kind: "customer" | "reseller" }) {
  const { data } = useQuery({
    queryKey: [kind, id, "usage"],
    queryFn: () => (kind === "customer" ? getCustomerUsage(id) : getResellerUsage(id)),
    enabled: false,
  });
  const qc = useQueryClient();

  return (
    <Dialog onOpenChange={(o) => o && qc.refetchQueries({ queryKey: [kind, id, "usage"] })}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="View usage">
          <BarChart3 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent title="Usage report">
        {!data ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Domains" value={formatNumber(data.domains)} />
            <Stat label="Mailboxes" value={formatNumber(data.mailboxes)} />
            <Stat label="Storage allocated" value={formatBytes(data.storageAllocated)} />
            <Stat label="Messages sent" value={formatNumber(data.messagesSent)} />
            <Stat label="Messages received" value={formatNumber(data.messagesReceived)} />
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}

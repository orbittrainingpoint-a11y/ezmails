import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { listDomains, type Domain } from "./api";
import { CreateDomainDialog } from "./CreateDomainDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatBytes } from "@/lib/format";

export function DomainsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["domains", { search }],
    queryFn: () => listDomains({ search }),
  });

  const columns: Column<Domain>[] = [
    { key: "domainName", header: "Domain", render: (d) => <span className="font-medium">{d.domainName}</span> },
    {
      key: "source",
      header: "Source",
      render: (d) => <Badge tone="neutral">{d.sourceType === "vps_hosted" ? "VPS" : "External"}</Badge>,
    },
    { key: "mailboxes", header: "Mailboxes", render: (d) => `${d._count?.mailboxes ?? 0} / ${d.maxMailboxes}` },
    { key: "quota", header: "Storage", render: (d) => formatBytes(d.storageQuota) },
    {
      key: "status",
      header: "Status",
      render: (d) =>
        d.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Domains</h1>
        <CreateDomainDialog />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
        <Input
          placeholder="Search domains…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.items}
        isLoading={isLoading}
        rowKey={(d) => d.id}
        onRowClick={(d) => navigate(`/domains/${d.id}`)}
        empty="No domains yet. Add your first domain to get started."
      />
    </div>
  );
}

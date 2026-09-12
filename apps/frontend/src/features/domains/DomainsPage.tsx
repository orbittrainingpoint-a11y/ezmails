import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, ShieldAlert } from "lucide-react";
import { listDomains, domainHealth, type Domain } from "./api";
import { CreateDomainDialog } from "./CreateDomainDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatBytes } from "@/lib/format";

const healthTone = { healthy: "success", attention: "danger", propagating: "warning", unknown: "neutral" } as const;
const healthLabel = { healthy: "Healthy", attention: "Needs attention", propagating: "Propagating", unknown: "Unchecked" } as const;

export function DomainsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [params, setParams] = useSearchParams();
  const onlyAttention = params.get("health") === "attention";
  const { data, isLoading } = useQuery({
    queryKey: ["domains", { search }],
    queryFn: () => listDomains({ search }),
  });

  const items = onlyAttention ? data?.items.filter((d) => domainHealth(d) === "attention") : data?.items;

  const columns: Column<Domain>[] = [
    { key: "domainName", header: "Domain", render: (d) => <span className="font-medium">{d.domainName}</span> },
    {
      key: "source",
      header: "Source",
      render: (d) => <Badge tone="neutral">{d.sourceType === "vps_hosted" ? "VPS" : "External"}</Badge>,
    },
    {
      key: "dnsHealth",
      header: "DNS health",
      render: (d) => <Badge tone={healthTone[domainHealth(d)]}>{healthLabel[domainHealth(d)]}</Badge>,
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            placeholder="Search domains…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant={onlyAttention ? "primary" : "outline"}
          size="sm"
          onClick={() => setParams(onlyAttention ? {} : { health: "attention" })}
        >
          <ShieldAlert className="h-4 w-4" /> Needs attention only
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        rowKey={(d) => d.id}
        onRowClick={(d) => navigate(`/domains/${d.id}`)}
        empty={onlyAttention ? "No domains need attention right now." : "No domains yet. Add your first domain to get started."}
      />
    </div>
  );
}

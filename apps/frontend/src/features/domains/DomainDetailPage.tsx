import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getDomain } from "./api";
import { DnsWizard } from "./DnsWizard";
import { DkimPanel } from "./DkimPanel";
import { DomainSettings } from "./DomainSettings";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { FullPageSpinner } from "@/components/ui/Spinner";

export function DomainDetailPage() {
  const { id = "" } = useParams();
  const { data: domain, isLoading } = useQuery({ queryKey: ["domains", id], queryFn: () => getDomain(id) });

  if (isLoading) return <FullPageSpinner />;
  if (!domain) return <p className="text-sm text-text-secondary">Domain not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/domains" className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" /> Domains
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{domain.domainName}</h1>
          {domain.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>}
        </div>
      </div>

      <Tabs defaultValue="dns">
        <TabsList>
          <TabsTrigger value="dns">DNS setup</TabsTrigger>
          <TabsTrigger value="dkim">DKIM</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="dns">
          <DnsWizard domainId={domain.id} />
        </TabsContent>
        <TabsContent value="dkim">
          <DkimPanel domainId={domain.id} />
        </TabsContent>
        <TabsContent value="settings">
          <DomainSettings domain={domain} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

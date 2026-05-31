import { useState } from "react";
import { MailboxTab } from "./MailboxTab";
import { AliasTab } from "./AliasTab";
import { ForwarderTab } from "./ForwarderTab";
import { DomainSelect } from "@/components/ui/DomainSelect";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Card, CardContent } from "@/components/ui/Card";

export function MailboxesPage() {
  const [domainId, setDomainId] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Mailboxes</h1>
        <DomainSelect value={domainId} onChange={setDomainId} />
      </div>

      {!domainId ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-text-secondary">
              Select a domain to manage its mailboxes, aliases, and forwarders.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="mailboxes">
          <TabsList>
            <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
            <TabsTrigger value="aliases">Aliases</TabsTrigger>
            <TabsTrigger value="forwarders">Forwarders</TabsTrigger>
          </TabsList>
          <TabsContent value="mailboxes">
            <MailboxTab domainId={domainId} />
          </TabsContent>
          <TabsContent value="aliases">
            <AliasTab domainId={domainId} />
          </TabsContent>
          <TabsContent value="forwarders">
            <ForwarderTab domainId={domainId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

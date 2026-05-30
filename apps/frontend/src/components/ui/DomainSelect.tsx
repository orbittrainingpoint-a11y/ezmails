import { useQuery } from "@tanstack/react-query";
import { listDomains } from "@/features/domains/api";

/** Domain picker used by the mailbox/alias/forwarder screens. */
export function DomainSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useQuery({ queryKey: ["domains", { all: true }], queryFn: () => listDomains({}) });
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 min-w-56 rounded-md border border-border bg-surface px-3 text-sm"
    >
      <option value="">Select a domain…</option>
      {data?.items.map((d) => (
        <option key={d.id} value={d.id}>
          {d.domainName}
        </option>
      ))}
    </select>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { importPreview, importCommit, type ImportRowResult } from "./api";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const SAMPLE = "address,display name,password,quota\njohn,John Doe,Secret123!,1073741824";

export function ImportDialog({ domainId }: { domainId: string }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportRowResult[] | null>(null);
  const qc = useQueryClient();

  const previewMut = useMutation({
    mutationFn: () => importPreview(domainId, csv),
    onSuccess: setPreview,
    onError: () => toast.error("Could not parse CSV."),
  });

  const commitMut = useMutation({
    mutationFn: () => importCommit(domainId, csv),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["mailboxes", domainId] });
      toast.success(`Imported ${r.created} mailbox(es).`);
      setOpen(false);
      setCsv("");
      setPreview(null);
    },
  });

  const validCount = preview?.filter((r) => r.valid).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4" /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent title="Bulk import mailboxes" className="max-w-2xl">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Columns: <code className="font-mono">address, display name, password, quota</code> (header row required).
          </p>
          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
            }}
            placeholder={SAMPLE}
            rows={6}
            className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs"
          />

          {preview && (
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="text-left text-text-secondary">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2">Address</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.index} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-mono">{r.address}</td>
                      <td className="px-3 py-2">
                        {r.valid ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Error</Badge>}
                      </td>
                      <td className="px-3 py-2 text-danger">{r.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            {!preview ? (
              <Button onClick={() => previewMut.mutate()} loading={previewMut.isPending} disabled={!csv.trim()}>
                Validate
              </Button>
            ) : (
              <Button onClick={() => commitMut.mutate()} loading={commitMut.isPending} disabled={validCount === 0}>
                Import {validCount} valid
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

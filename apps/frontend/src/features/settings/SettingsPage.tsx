import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, KeyRound, Bell, Trash2, Plus } from "lucide-react";
import {
  totpSetup,
  totpVerify,
  listTokens,
  createToken,
  revokeToken,
  getEmailAlerts,
  setEmailAlerts,
  type TotpSetup,
  type EmailAlerts,
} from "./api";
import { useAuth } from "@/stores/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { CopyButton } from "@/components/ui/CopyButton";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { toast } from "@/components/ui/toast";
import { formatDate, formatRelative } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeToggle";

export function SettingsPage() {
  const role = useAuth((s) => s.user?.role);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <TwoFactorCard />
        <AppearanceCard />
        <ApiTokensCard />
        {role === "super_admin" && <EmailAlertsCard />}
      </div>
    </div>
  );
}

function AppearanceCard() {
  return (
    <Card>
      <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Toggle dark / light theme</span>
          <ThemeToggle />
        </div>
      </CardContent>
    </Card>
  );
}

function TwoFactorCard() {
  const totpEnabled = useAuth((s) => s.user?.totpEnabled);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);

  const start = useMutation({ mutationFn: totpSetup, onSuccess: setSetup });
  const verify = useMutation({
    mutationFn: () => totpVerify(code),
    onSuccess: () => { setDone(true); toast.success("Two-factor authentication enabled."); },
    onError: () => toast.error("Invalid code."),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Two-factor authentication</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {totpEnabled || done ? (
          <Alert tone="success">2FA is enabled on your account.</Alert>
        ) : !setup ? (
          <>
            <p className="text-sm text-text-secondary">Protect your account with a TOTP authenticator app.</p>
            <Button onClick={() => start.mutate()} loading={start.isPending}>Enable 2FA</Button>
          </>
        ) : (
          <div className="space-y-3">
            <img src={setup.qrDataUrl} alt="TOTP QR code" className="h-44 w-44 rounded-md border border-border bg-white p-2" />
            <div>
              <p className="mb-1 text-xs text-text-secondary">Save these recovery codes somewhere safe:</p>
              <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-elevated p-2 font-mono text-xs">
                {setup.recoveryCodes.map((c) => <span key={c}>{c}</span>)}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="code">Enter a code to confirm</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" />
              </div>
              <Button onClick={() => verify.mutate()} loading={verify.isPending} disabled={code.length !== 6}>Verify</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApiTokensCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["api-tokens"], queryFn: listTokens });
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createToken(name),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["api-tokens"] }); setFresh(t.token); setName(""); },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-tokens"] }),
  });

  const columns: Column<NonNullable<typeof data>[number]>[] = [
    { key: "name", header: "Name", render: (t) => <span className="font-medium">{t.name}</span> },
    { key: "lastUsedAt", header: "Last used", render: (t) => formatRelative(t.lastUsedAt) },
    { key: "createdAt", header: "Created", render: (t) => formatDate(t.createdAt) },
    {
      key: "status",
      header: "Status",
      render: (t) => (t.revokedAt ? <Badge tone="danger">revoked</Badge> : <Badge tone="success">active</Badge>),
    },
    {
      key: "actions",
      header: "",
      className: "w-px",
      render: (t) => !t.revokedAt && <Button variant="ghost" size="icon" onClick={() => revoke.mutate(t.id)} aria-label="Revoke"><Trash2 className="h-4 w-4 text-danger" /></Button>,
    },
  ];

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> API tokens</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {fresh && (
          <Alert tone="warning">
            <div className="flex items-center gap-2">
              <span className="break-all font-mono text-xs">{fresh}</span>
              <CopyButton value={fresh} />
            </div>
            <p className="mt-1 text-xs">Copy this now — it won't be shown again.</p>
          </Alert>
        )}
        <div className="flex items-end gap-2">
          <Input placeholder="Token name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}><Plus className="h-4 w-4" /> Create</Button>
        </div>
        <DataTable columns={columns} data={data} isLoading={isLoading} rowKey={(t) => t.id} empty="No tokens." />
      </CardContent>
    </Card>
  );
}

function EmailAlertsCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["email-alerts"], queryFn: getEmailAlerts });
  const { register, handleSubmit, reset } = useForm<EmailAlerts>();
  useEffect(() => { if (data) reset(data); }, [data, reset]);

  const save = useMutation({
    mutationFn: (v: EmailAlerts) => setEmailAlerts({ enabled: v.enabled, address: v.address || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-alerts"] }); toast.success("Saved."); },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Critical email alerts</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" {...register("enabled")} /> Send critical alerts by email</label>
          <div><Label htmlFor="address">Alert address</Label><Input id="address" type="email" placeholder="ops@example.com" {...register("address")} /></div>
          <Button type="submit" loading={save.isPending}>Save</Button>
        </form>
      </CardContent>
    </Card>
  );
}

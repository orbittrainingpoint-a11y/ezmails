import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User, Bell, ShieldCheck, Sparkles, Filter, Ban, PenTool, Plane, Forward, Upload, Info, Trash2, Plus, LogOut,
} from "lucide-react";
import {
  wmAccount, wmUpdateName, wmChangePassword,
  wmForwarding, wmAddForwarding, wmDeleteForwarding,
  wmBlockedSenders, wmBlockSender, wmUnblockSender,
  wmImportContacts, wmGetFullSettings, wmSaveSettings, aiStatus, wmLogout, WmError,
} from "./api";
import { useWebmail } from "./store";
import { TwoFactor } from "./TwoFactor";
import { SignatureDesigner } from "./SignatureDesigner";
import { Rules } from "./Rules";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/toast";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type SectionId =
  | "account" | "notifications" | "security" | "ai"
  | "rules" | "blocked"
  | "signature" | "vacation" | "forwarding" | "import"
  | "branding";

const GROUPS: { label: string; items: { id: SectionId; label: string; icon: typeof User }[] }[] = [
  { label: "Account & Security", items: [
    { id: "account", label: "Account", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security (2FA)", icon: ShieldCheck },
    { id: "ai", label: "AI Assistant", icon: Sparkles },
  ] },
  { label: "Inbox & Organization", items: [
    { id: "rules", label: "Rules", icon: Filter },
    { id: "blocked", label: "Blocked Senders", icon: Ban },
  ] },
  { label: "Send & Reply", items: [
    { id: "signature", label: "Signatures", icon: PenTool },
    { id: "vacation", label: "Vacation Responder", icon: Plane },
    { id: "forwarding", label: "Forwarding", icon: Forward },
    { id: "import", label: "Import Contacts", icon: Upload },
  ] },
  { label: "About", items: [{ id: "branding", label: "Branding", icon: Info }] },
];

export function Settings() {
  const [active, setActive] = useState<SectionId>("account");
  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 overflow-auto border-r border-border bg-surface p-3">
        <h2 className="px-2 pb-2 text-lg font-semibold">Settings</h2>
        {GROUPS.map((g) => (
          <div key={g.label} className="mb-4">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{g.label}</div>
            {g.items.map((it) => (
              <button
                key={it.id}
                onClick={() => setActive(it.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  active === it.id ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-elevated",
                )}
              >
                <it.icon className="h-4 w-4" /> {it.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl">
          {active === "account" && <AccountSection />}
          {active === "notifications" && <NotificationsSection />}
          {active === "security" && <TwoFactor />}
          {active === "ai" && <AISection />}
          {active === "rules" && <div className="-m-6"><Rules /></div>}
          {active === "blocked" && <BlockedSection />}
          {active === "signature" && <SignatureDesigner />}
          {active === "vacation" && <VacationSection />}
          {active === "forwarding" && <ForwardingSection />}
          {active === "import" && <ImportSection />}
          {active === "branding" && <BrandingSection />}
        </div>
      </div>
    </div>
  );
}

function AccountSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "account"], queryFn: wmAccount });
  const profile = useWebmail((s) => s.profile);
  const setProfile = useWebmail((s) => s.setProfile);
  const [name, setName] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  useEffect(() => { if (data?.displayName) setName(data.displayName); }, [data]);

  const saveName = useMutation({
    mutationFn: () => wmUpdateName(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "account"] }); if (profile) setProfile({ ...profile, displayName: name }); toast.success("Name updated."); },
  });
  const changePw = useMutation({
    mutationFn: () => wmChangePassword(cur, next),
    onSuccess: () => { setCur(""); setNext(""); toast.success("Password changed."); },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Failed."),
  });

  const used = data?.storageUsedBytes ?? 0;
  const total = Number(data?.storageQuotaBytes ?? 1);
  const pct = Math.min(100, Math.round((used / total) * 100));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xl font-semibold text-white">
              {(data?.displayName || data?.email || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium">{data?.email}</div>
              <div className="text-sm text-text-secondary">Member since {data ? formatDate(data.createdAt) : "—"}</div>
            </div>
          </div>
          <div>
            <Label htmlFor="dn">Display name (visible to recipients)</Label>
            <div className="flex gap-2">
              <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} />
              <Button onClick={() => saveName.mutate()} loading={saveName.isPending}>Save</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Storage</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-1 flex justify-between text-sm">
            <span className={cn(pct >= 90 && "text-danger")}>{formatBytes(used)} of {formatBytes(total)} used</span>
            <span className="text-text-secondary">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-elevated">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? "var(--color-danger)" : "var(--color-primary)" }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label htmlFor="cp">Current password</Label><Input id="cp" type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
          <div><Label htmlFor="np">New password</Label><Input id="np" type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
          <Button onClick={() => changePw.mutate()} loading={changePw.isPending} disabled={!cur || next.length < 8}>Update password</Button>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={() => wmLogout().then(() => location.assign("/webmail/login"))}><LogOut className="h-4 w-4" /> Log out</Button>
    </div>
  );
}

function NotificationsSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const prefs = (data?.prefs ?? {}) as Record<string, boolean>;
  const save = useMutation({
    mutationFn: (p: Record<string, unknown>) => wmSaveSettings({ prefs: { ...prefs, ...p } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }); toast.success("Saved."); },
  });
  const Row = ({ k, label }: { k: string; label: string }) => (
    <label className="flex items-center justify-between border-b border-border py-3 text-sm last:border-0">
      {label}
      <input type="checkbox" className="accent-primary" checked={!!prefs[k]} onChange={(e) => save.mutate({ [k]: e.target.checked })} />
    </label>
  );
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <Card><CardContent>
        <Row k="desktopNotifications" label="Desktop notifications for new mail" />
        <Row k="soundOnNew" label="Play a sound on new mail" />
        <Row k="notifyImportantOnly" label="Notify for important messages only" />
      </CardContent></Card>
    </div>
  );
}

function AISection() {
  const { data } = useQuery({ queryKey: ["wm", "aistatus"], queryFn: aiStatus });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">AI Assistant</h1>
      <Card><CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-secondary" />
          <span className="font-medium">AI Smart Write</span>
          {data?.enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="warning">Not configured</Badge>}
        </div>
        <p className="text-sm text-text-secondary">
          AI Smart Write drafts emails and quick replies for you, powered by Google Gemini (free tier).
          {!data?.enabled && " Add a GEMINI_API_KEY to the server environment to enable it."}
        </p>
      </CardContent></Card>
    </div>
  );
}

function BlockedSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "blocked"], queryFn: wmBlockedSenders });
  const [email, setEmail] = useState("");
  const add = useMutation({ mutationFn: () => wmBlockSender(email), onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "blocked"] }); setEmail(""); } });
  const rm = useMutation({ mutationFn: (e: string) => wmUnblockSender(e), onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "blocked"] }) });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Blocked Senders</h1>
      <Card><CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="spammer@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!email}><Plus className="h-4 w-4" /> Block</Button>
        </div>
        {data?.length === 0 && <p className="text-sm text-text-secondary">No blocked senders.</p>}
        {data?.map((e) => (
          <div key={e} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <span>{e}</span>
            <Button variant="ghost" size="icon" onClick={() => rm.mutate(e)} aria-label="Unblock"><Trash2 className="h-4 w-4 text-danger" /></Button>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}

function VacationSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const { register, handleSubmit, reset } = useForm<{ vacationEnabled: boolean; vacationSubject: string | null; vacationMessage: string | null }>();
  useEffect(() => { if (data) reset({ vacationEnabled: data.vacationEnabled, vacationSubject: data.vacationSubject, vacationMessage: data.vacationMessage }); }, [data, reset]);
  const save = useMutation({
    mutationFn: (v: { vacationEnabled: boolean; vacationSubject: string | null; vacationMessage: string | null }) => wmSaveSettings(v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }); toast.success("Vacation responder saved."); },
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Vacation Responder</h1>
      <Card><CardContent>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" {...register("vacationEnabled")} /> Send automatic replies while away</label>
          <div><Label htmlFor="vs">Subject</Label><Input id="vs" {...register("vacationSubject")} /></div>
          <div><Label htmlFor="vm">Message</Label><textarea id="vm" className="min-h-28 w-full rounded-md border border-border bg-surface p-3 text-sm" {...register("vacationMessage")} /></div>
          <Button type="submit" loading={save.isPending}>Save</Button>
        </form>
      </CardContent></Card>
    </div>
  );
}

function ForwardingSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "forwarding"], queryFn: wmForwarding });
  const [dest, setDest] = useState("");
  const [keep, setKeep] = useState(true);
  const add = useMutation({ mutationFn: () => wmAddForwarding(dest, keep), onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "forwarding"] }); setDest(""); toast.success("Forwarding added."); }, onError: (e) => toast.error(e instanceof WmError ? e.message : "Failed.") });
  const rm = useMutation({ mutationFn: (id: string) => wmDeleteForwarding(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "forwarding"] }) });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Forwarding</h1>
      <Card><CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="forward-to@example.com" className="flex-1" value={dest} onChange={(e) => setDest(e.target.value)} />
          <label className="flex items-center gap-1 text-sm text-text-secondary"><input type="checkbox" className="accent-primary" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep a copy</label>
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!dest}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        {data?.length === 0 && <p className="text-sm text-text-secondary">No forwarding rules.</p>}
        {data?.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <span>→ {f.destination} {f.keepCopy && <Badge tone="neutral">keep copy</Badge>}</span>
            <Button variant="ghost" size="icon" onClick={() => rm.mutate(f.id)} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}

function ImportSection() {
  const [csv, setCsv] = useState("");
  const imp = useMutation({ mutationFn: () => wmImportContacts(csv), onSuccess: (r) => { toast.success(`Imported ${r.imported} contact(s).`); setCsv(""); }, onError: () => toast.error("Import failed.") });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Import Contacts</h1>
      <Card><CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">Paste CSV with <code>name,email</code> columns.</p>
        <textarea rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="name,email&#10;Jane Doe,jane@example.com" className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs" />
        <Button onClick={() => imp.mutate()} loading={imp.isPending} disabled={!csv.trim()}><Upload className="h-4 w-4" /> Import</Button>
      </CardContent></Card>
    </div>
  );
}

function BrandingSection() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
      <Card><CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary text-white">e</div>
          <span className="text-lg font-semibold">ezmails</span>
        </div>
        <p className="text-sm text-text-secondary">Your private, self-hosted email platform. Admins can customise the workspace branding from the admin panel.</p>
      </CardContent></Card>
    </div>
  );
}

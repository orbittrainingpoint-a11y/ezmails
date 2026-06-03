import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User, Bell, ShieldCheck, Sparkles, Filter, Ban, PenTool, Plane, Forward, Upload, Info, Trash2, Plus, LogOut, Download, ArrowLeft, KeyRound, Copy, Check, Star, SpellCheck, Eye,
} from "lucide-react";
import {
  wmAccount, wmUpdateName, wmChangePassword,
  wmForwarding, wmAddForwarding, wmDeleteForwarding,
  wmBlockedSenders, wmBlockSender, wmUnblockSender,
  wmAllowedSenders, wmAllowSender, wmUnallowSender,
  wmImportContacts, wmImportImap, wmGetFullSettings, wmSaveSettings, aiStatus, wmLogout, WmError,
  wmAppPasswords, wmCreateAppPassword, wmRevokeAppPassword, type AppPassword,
  wmTracking, wmRunAutoClean, wmFolders,
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
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "@/components/ui/toast";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type SectionId =
  | "account" | "notifications" | "security" | "apppasswords" | "backup" | "ai"
  | "rules" | "priority" | "blocked" | "autoclean"
  | "signature" | "grammar" | "tracking" | "vacation" | "forwarding" | "import" | "importmail"
  | "branding";

const GROUPS: { label: string; items: { id: SectionId; label: string; icon: typeof User }[] }[] = [
  { label: "Account & Security", items: [
    { id: "account", label: "Account", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security (2FA)", icon: ShieldCheck },
    { id: "apppasswords", label: "App Passwords", icon: KeyRound },
    { id: "backup", label: "Email Backup", icon: Download },
    { id: "ai", label: "AI Assistant", icon: Sparkles },
  ] },
  { label: "Inbox & Organization", items: [
    { id: "rules", label: "Rules", icon: Filter },
    { id: "priority", label: "Priority Inbox", icon: Star },
    { id: "autoclean", label: "Auto-clean", icon: Trash2 },
    { id: "blocked", label: "Manage Senders", icon: Ban },
  ] },
  { label: "Send & Reply", items: [
    { id: "signature", label: "Signatures", icon: PenTool },
    { id: "grammar", label: "Grammar & Spelling", icon: SpellCheck },
    { id: "tracking", label: "Tracking", icon: Eye },
    { id: "vacation", label: "Vacation Responder", icon: Plane },
    { id: "forwarding", label: "Forwarding", icon: Forward },
    { id: "import", label: "Import Contacts", icon: Upload },
    { id: "importmail", label: "Import Email", icon: Download },
  ] },
  { label: "About", items: [{ id: "branding", label: "Branding", icon: Info }] },
];

export function Settings() {
  const [active, setActive] = useState<SectionId>("account");
  // On phones the rail and the section content swap (single-pane flow); on lg+ they sit side by side.
  const [mobileOpen, setMobileOpen] = useState(false);
  const openSection = (id: SectionId) => { setActive(id); setMobileOpen(true); };
  const activeLabel = GROUPS.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? "Settings";
  return (
    <div className="flex h-full">
      <aside className={cn(
        "w-full shrink-0 overflow-auto border-r border-border bg-surface p-3 lg:w-60",
        mobileOpen ? "hidden lg:block" : "block",
      )}>
        <h2 className="px-2 pb-2 text-lg font-semibold">Settings</h2>
        {GROUPS.map((g) => (
          <div key={g.label} className="mb-4">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{g.label}</div>
            {g.items.map((it) => (
              <button
                key={it.id}
                onClick={() => openSection(it.id)}
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

      <div className={cn("min-w-0 flex-1 overflow-auto p-4 sm:p-6", mobileOpen ? "block" : "hidden lg:block")}>
        <button
          onClick={() => setMobileOpen(false)}
          className="mb-3 flex items-center gap-1 text-sm font-medium text-primary lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" /> {activeLabel}
        </button>
        <div className="mx-auto max-w-3xl">
          {active === "account" && <AccountSection />}
          {active === "notifications" && <NotificationsSection />}
          {active === "security" && <TwoFactor />}
          {active === "apppasswords" && <AppPasswordsSection />}
          {active === "backup" && <BackupSection />}
          {active === "ai" && <AISection />}
          {active === "rules" && <div className="-m-6"><Rules /></div>}
          {active === "priority" && <PrioritySection />}
          {active === "autoclean" && <AutoCleanSection />}
          {active === "blocked" && <ManageSendersSection />}
          {active === "signature" && <SignatureDesigner />}
          {active === "grammar" && <GrammarSection />}
          {active === "tracking" && <TrackingSection />}
          {active === "vacation" && <VacationSection />}
          {active === "forwarding" && <ForwardingSection />}
          {active === "import" && <ImportSection />}
          {active === "importmail" && <ImportMailSection />}
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

/** Reusable email-list editor backed by a query + add/remove mutations. */
function SenderList({ title, hint, items, onAdd, onRemove, adding, accent }: {
  title: string; hint: string; items: string[] | undefined;
  onAdd: (email: string) => void; onRemove: (email: string) => void; adding: boolean; accent: "danger" | "success";
}) {
  const [email, setEmail] = useState("");
  return (
    <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">{hint}</p>
        <div className="flex gap-2">
          <Input placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) { onAdd(email.trim()); setEmail(""); } }} />
          <Button onClick={() => { onAdd(email.trim()); setEmail(""); }} loading={adding} disabled={!email.trim()}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        {items?.length === 0 && <p className="text-sm text-text-secondary">Nothing here yet.</p>}
        <div className="space-y-1">
          {items?.map((e) => (
            <div key={e} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{e}</span>
              <Button variant="ghost" size="icon" onClick={() => onRemove(e)} aria-label="Remove"><Trash2 className={cn("h-4 w-4", accent === "danger" ? "text-danger" : "text-text-secondary hover:text-danger")} /></Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ManageSendersSection() {
  const qc = useQueryClient();
  const blocked = useQuery({ queryKey: ["wm", "blocked"], queryFn: wmBlockedSenders });
  const allowed = useQuery({ queryKey: ["wm", "allowed"], queryFn: wmAllowedSenders });
  const block = useMutation({ mutationFn: (e: string) => wmBlockSender(e), onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "blocked"] }) });
  const unblock = useMutation({ mutationFn: (e: string) => wmUnblockSender(e), onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "blocked"] }) });
  const allow = useMutation({ mutationFn: (e: string) => wmAllowSender(e), onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "allowed"] }) });
  const unallow = useMutation({ mutationFn: (e: string) => wmUnallowSender(e), onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "allowed"] }) });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manage Senders</h1>
        <p className="mt-1 text-sm text-text-secondary">Mail from blocked senders is moved to Spam by your inbox rules; allowed (safe) senders always reach your inbox.</p>
      </div>
      <SenderList title="Safe senders (allow list)" hint="These addresses are trusted and never marked as spam." items={allowed.data}
        onAdd={(e) => allow.mutate(e)} onRemove={(e) => unallow.mutate(e)} adding={allow.isPending} accent="success" />
      <SenderList title="Blocked senders" hint="Mail from these addresses is sent to Spam." items={blocked.data}
        onAdd={(e) => block.mutate(e)} onRemove={(e) => unblock.mutate(e)} adding={block.isPending} accent="danger" />
    </div>
  );
}

interface AutoCleanRule { folder: string; olderThanDays: number; action: "trash" | "delete" }

function AutoCleanSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const { data: folders } = useQuery({ queryKey: ["wm", "folders"], queryFn: wmFolders });
  const prefs = (data?.prefs ?? {}) as Record<string, unknown>;
  const ac = (prefs.autoClean as { enabled?: boolean; rules?: AutoCleanRule[] } | undefined) ?? {};
  const enabled = ac.enabled ?? false;
  const rules = ac.rules ?? [];

  const save = useMutation({
    mutationFn: (next: { enabled?: boolean; rules?: AutoCleanRule[] }) =>
      wmSaveSettings({ prefs: { ...prefs, autoClean: { ...ac, ...next } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }),
  });
  const run = useMutation({
    mutationFn: wmRunAutoClean,
    onSuccess: (r) => toast.success(r.cleaned > 0 ? `Cleaned ${r.cleaned} message${r.cleaned > 1 ? "s" : ""}.` : "Nothing to clean."),
    onError: () => toast.error("Could not run auto-clean."),
  });

  const setRule = (i: number, patch: Partial<AutoCleanRule>) =>
    save.mutate({ rules: rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const addRule = () => save.mutate({ rules: [...rules, { folder: "INBOX", olderThanDays: 30, action: "trash" }] });
  const removeRule = (i: number) => save.mutate({ rules: rules.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auto-clean</h1>
        <p className="mt-1 text-sm text-text-secondary">Automatically tidy old mail. Rules run when you open your inbox (about twice a day) — or run them now. “Move to Trash” is recoverable; “Delete permanently” is not.</p>
      </div>
      <Card><CardContent className="space-y-4 pt-6">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium">Enable auto-clean</span>
          <input type="checkbox" checked={enabled} onChange={(e) => save.mutate({ enabled: e.target.checked })} className="h-4 w-4" />
        </label>

        <div className="space-y-2 border-t border-border pt-3">
          {rules.length === 0 && <p className="text-sm text-text-secondary">No rules yet.</p>}
          {rules.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
              <span className="text-text-secondary">In</span>
              <select value={r.folder} onChange={(e) => setRule(i, { folder: e.target.value })} className="h-8 rounded-md border border-border bg-surface px-2 text-xs">
                {(folders ?? [{ path: "INBOX", name: "Inbox" }]).map((f) => <option key={f.path} value={f.path}>{f.name}</option>)}
              </select>
              <span className="text-text-secondary">older than</span>
              <Input type="number" min={1} value={r.olderThanDays} onChange={(e) => setRule(i, { olderThanDays: Number(e.target.value) })} className="h-8 w-20" />
              <span className="text-text-secondary">days,</span>
              <select value={r.action} onChange={(e) => setRule(i, { action: e.target.value as AutoCleanRule["action"] })} className="h-8 rounded-md border border-border bg-surface px-2 text-xs">
                <option value="trash">move to Trash</option>
                <option value="delete">delete permanently</option>
              </select>
              <button onClick={() => removeRule(i)} className="ml-auto text-text-secondary hover:text-danger" aria-label="Remove rule"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRule}><Plus className="h-4 w-4" /> Add rule</Button>
        </div>

        <div className="border-t border-border pt-3">
          <Button variant="outline" onClick={() => run.mutate()} loading={run.isPending} disabled={rules.length === 0}><Trash2 className="h-4 w-4" /> Run clean-up now</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}

function PrioritySection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const prefs = (data?.prefs ?? {}) as Record<string, unknown>;
  const enabled = (prefs.priorityInbox as boolean | undefined) ?? false;
  const vips = (prefs.vipSenders as string[] | undefined) ?? [];
  const [email, setEmail] = useState("");
  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) => wmSaveSettings({ prefs: { ...prefs, ...next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }),
  });
  const addVip = () => { const e = email.trim().toLowerCase(); if (!e || vips.includes(e)) { setEmail(""); return; } save.mutate({ vipSenders: [...vips, e] }); setEmail(""); };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Priority Inbox</h1>
        <p className="mt-1 text-sm text-text-secondary">Highlight mail from important people so it stands out in your inbox.</p>
      </div>
      <Card><CardContent className="space-y-4">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium">Mark VIP senders in the message list</span>
          <input type="checkbox" checked={enabled} onChange={(e) => save.mutate({ priorityInbox: e.target.checked })} className="h-4 w-4" />
        </label>
        <div className="border-t border-border pt-3">
          <Label className="mb-1 flex items-center gap-1"><Star className="h-4 w-4 text-amber-500" /> VIP people</Label>
          <div className="flex gap-2">
            <Input placeholder="boss@company.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addVip()} />
            <Button onClick={addVip} disabled={!email.trim()}><Plus className="h-4 w-4" /> Add</Button>
          </div>
          <div className="mt-3 space-y-1">
            {vips.length === 0 && <p className="text-sm text-text-secondary">No VIP senders yet.</p>}
            {vips.map((e) => (
              <div key={e} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span className="flex items-center gap-2"><Star className="h-3.5 w-3.5 text-amber-500" /> {e}</span>
                <Button variant="ghost" size="icon" onClick={() => save.mutate({ vipSenders: vips.filter((x) => x !== e) })} aria-label="Remove"><Trash2 className="h-4 w-4 text-text-secondary hover:text-danger" /></Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent></Card>
    </div>
  );
}

function TrackingSection() {
  const { data, isLoading } = useQuery({ queryKey: ["wm", "tracking"], queryFn: wmTracking });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tracking</h1>
        <p className="mt-1 text-sm text-text-secondary">When you turn on <strong>Track</strong> in the composer, ezmail embeds an invisible pixel so you can see when a message is opened. Some mail apps block images, so opens are an estimate.</p>
      </div>
      <Card><CardContent className="pt-6">
        {isLoading ? <p className="text-sm text-text-secondary">Loading…</p>
          : !data || data.length === 0 ? <p className="text-sm text-text-secondary">No tracked messages yet. Toggle “Track” when composing.</p>
          : (
            <ul className="divide-y divide-border">
              {data.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.subject || "(no subject)"}</div>
                    <div className="truncate text-xs text-text-secondary">To {t.recipients || "—"} · sent {formatDate(new Date(t.createdAt))}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    {t.opens > 0 ? (
                      <>
                        <div className="flex items-center gap-1 text-sm font-medium text-success"><Eye className="h-4 w-4" /> Opened {t.opens > 1 ? `${t.opens}×` : ""}</div>
                        {t.lastOpenAt && <div className="text-xs text-text-secondary">{formatDate(new Date(t.lastOpenAt))}</div>}
                      </>
                    ) : <span className="text-xs text-text-secondary">Not opened yet</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </CardContent></Card>
    </div>
  );
}

function BackupSection() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email Backup</h1>
        <p className="mt-1 text-sm text-text-secondary">Download a complete copy of your mailbox as a standard <code className="rounded bg-elevated px-1">.mbox</code> file — every folder and message. You can import it into Thunderbird, Apple Mail, or another mail server.</p>
      </div>
      <Card><CardContent className="space-y-3 pt-6">
        <a href="/webmail-api/backup/export" download
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          <Download className="h-4 w-4" /> Export all email (.mbox)
        </a>
        <p className="text-xs text-text-secondary">Large mailboxes may take a little while — keep this tab open until the download starts.</p>
      </CardContent></Card>
    </div>
  );
}

function GrammarSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const prefs = (data?.prefs ?? {}) as Record<string, unknown>;
  const spellcheck = (prefs.spellcheck as boolean | undefined) ?? true;
  const grammarAI = (prefs.grammarAI as boolean | undefined) ?? true;
  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) => wmSaveSettings({ prefs: { ...prefs, ...next } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }); toast.success("Saved."); },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Grammar & Spelling</h1>
        <p className="mt-1 text-sm text-text-secondary">Catch mistakes while you write.</p>
      </div>
      <Card><CardContent className="space-y-4">
        <label className="flex items-center justify-between">
          <span><span className="text-sm font-medium">Spell check while typing</span><span className="block text-xs text-text-secondary">Red underline misspelled words in the composer.</span></span>
          <input type="checkbox" checked={spellcheck} onChange={(e) => save.mutate({ spellcheck: e.target.checked })} className="h-4 w-4" />
        </label>
        <label className="flex items-center justify-between border-t border-border pt-4">
          <span><span className="flex items-center gap-1 text-sm font-medium"><Sparkles className="h-4 w-4" /> AI “Fix grammar” button</span><span className="block text-xs text-text-secondary">Show a one-click proofread button in the composer (uses your AI provider).</span></span>
          <input type="checkbox" checked={grammarAI} onChange={(e) => save.mutate({ grammarAI: e.target.checked })} className="h-4 w-4" />
        </label>
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

const IMPORT_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  "Titan / Hostinger": { host: "imap.titan.email", port: 993, secure: true },
  "Gmail": { host: "imap.gmail.com", port: 993, secure: true },
  "Outlook / Microsoft 365": { host: "outlook.office365.com", port: 993, secure: true },
  "Zoho": { host: "imap.zoho.com", port: 993, secure: true },
  "Custom": { host: "", port: 993, secure: true },
};

function ImportMailSection() {
  const [preset, setPreset] = useState("Titan / Hostinger");
  const [host, setHost] = useState(IMPORT_PRESETS["Titan / Hostinger"]!.host);
  const [port, setPort] = useState(993);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");

  const imp = useMutation({
    mutationFn: () => wmImportImap({ host, port, secure: port === 993, user, password }),
    onSuccess: (r) => toast.success(`Imported ${r.copiedTotal} message(s) across ${r.folders.length} folder(s).${r.capped ? " (Large folders were capped — re-run to continue.)" : ""}`),
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Import failed."),
  });

  function applyPreset(name: string) {
    setPreset(name);
    const p = IMPORT_PRESETS[name];
    if (p) { setHost(p.host); setPort(p.port); }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Import Email</h1>
      <Card><CardContent className="space-y-4">
        <p className="text-sm text-text-secondary">
          Copy all your mail from another account (e.g. Titan) into this mailbox over IMAP. It’s safe to re-run — already-imported messages are skipped.
        </p>
        <div>
          <Label>Provider</Label>
          <select value={preset} onChange={(e) => applyPreset(e.target.value)} className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm">
            {Object.keys(IMPORT_PRESETS).map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="ih">IMAP host</Label><Input id="ih" value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.titan.email" /></div>
          <div><Label htmlFor="ip">Port</Label><Input id="ip" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} /></div>
          <div><Label htmlFor="iu">Email (source)</Label><Input id="iu" value={user} onChange={(e) => setUser(e.target.value)} placeholder="you@olddomain.com" /></div>
          <div><Label htmlFor="ipw">Password (source)</Label><Input id="ipw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </div>
        <Button onClick={() => imp.mutate()} loading={imp.isPending} disabled={!host || !user || !password}>
          <Download className="h-4 w-4" /> Start import
        </Button>
        {imp.isPending && <p className="text-xs text-text-secondary">Copying mail… this can take a minute for large mailboxes. Keep this tab open.</p>}
        {imp.data && (
          <div className="rounded-md border border-border bg-surface p-3 text-xs">
            <div className="mb-1 font-medium">Imported {imp.data.copiedTotal} message(s):</div>
            {imp.data.folders.map((f) => (
              <div key={f.folder} className="flex justify-between text-text-secondary">
                <span>{f.folder}</span><span>{f.copied} copied{f.skipped ? `, ${f.skipped} skipped` : ""}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-text-secondary">Your source password is used only to connect and is not stored. For very large mailboxes, large folders are copied in batches — re-run to continue.</p>
      </CardContent></Card>
    </div>
  );
}

function AppPasswordsSection() {
  const qc = useQueryClient();
  const { profile } = useWebmail();
  const { data: list, isLoading } = useQuery({ queryKey: ["wm", "app-passwords"], queryFn: wmAppPasswords });
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<{ label: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const host = typeof window !== "undefined" ? window.location.hostname : "your-mail-domain";
  const username = profile?.email ?? "you@your-domain";

  const create = useMutation({
    mutationFn: () => wmCreateAppPassword(label.trim()),
    onSuccess: (d) => {
      setCreated({ label: d.label, password: d.password });
      setLabel("");
      qc.invalidateQueries({ queryKey: ["wm", "app-passwords"] });
    },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Could not create app password."),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => wmRevokeAppPassword(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "app-passwords"] }); toast.success("App password revoked."); },
    onError: () => toast.error("Could not revoke."),
  });

  const grouped = created ? (created.password.match(/.{1,4}/g) ?? []).join(" ") : "";
  const copy = () => {
    if (!created) return;
    navigator.clipboard.writeText(created.password).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">App Passwords</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Create a separate password to sign in from a mail app (Outlook, Apple Mail, Thunderbird, your phone) without
          sharing your main password. Each one can be revoked any time — revoking signs out only that app.
        </p>
      </div>

      {/* Just-created password — shown ONCE */}
      {created && (
        <Card className="border-primary">
          <CardContent className="space-y-3 pt-6">
            <div className="text-sm font-medium">App password for “{created.label}”</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all rounded-md bg-elevated px-3 py-2 font-mono text-lg tracking-wider">{grouped}</code>
              <Button variant="outline" size="sm" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}</Button>
            </div>
            <p className="text-xs text-text-secondary">
              Copy it now — for your security it won’t be shown again. Paste it as the password in your mail app (spaces don’t matter).
            </p>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Done</Button>
          </CardContent>
        </Card>
      )}

      {/* Create new */}
      <Card><CardContent className="space-y-3 pt-6">
        <Label htmlFor="apnew">Create an app password</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="apnew" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. iPhone Mail" maxLength={100}
            onKeyDown={(e) => e.key === "Enter" && label.trim() && create.mutate()} />
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!label.trim()}><Plus className="h-4 w-4" /> Generate</Button>
        </div>
      </CardContent></Card>

      {/* Existing */}
      <Card><CardContent className="pt-6">
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : !list || list.length === 0 ? (
          <p className="text-sm text-text-secondary">No app passwords yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((ap: AppPassword) => (
              <li key={ap.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4 text-text-secondary" /> {ap.label}</div>
                  <div className="text-xs text-text-secondary">
                    Created {formatDate(new Date(ap.createdAt))}
                    {ap.lastUsedAt ? ` · last used ${formatDate(new Date(ap.lastUsedAt))}` : " · never used"}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => revoke.mutate(ap.id)} loading={revoke.isPending && revoke.variables === ap.id}>
                  <Trash2 className="h-4 w-4" /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      {/* Server settings cheat-sheet */}
      <Card><CardHeader><CardTitle className="text-base">Mail server settings</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-text-secondary">Use these in your mail app, with your email as the username and an app password above:</p>
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 font-mono text-xs">
            <dt className="text-text-secondary">Username</dt><dd>{username}</dd>
            <dt className="text-text-secondary">IMAP (incoming)</dt><dd>{host} · port 993 · SSL/TLS</dd>
            <dt className="text-text-secondary">SMTP (outgoing)</dt><dd>{host} · port 587 · STARTTLS</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function BrandingSection() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
      <Card><CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary text-white"><BrandLogo className="h-5 w-5" /></div>
          <span className="text-lg font-semibold">Infinit Email</span>
        </div>
        <p className="text-sm text-text-secondary">Your private, self-hosted email platform. Admins can customise the workspace branding from the admin panel.</p>
      </CardContent></Card>
    </div>
  );
}

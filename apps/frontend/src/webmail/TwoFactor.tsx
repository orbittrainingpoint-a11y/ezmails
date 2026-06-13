import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Smartphone, Mail, KeyRound, Monitor, LogOut, Fingerprint, Trash2 } from "lucide-react";
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import {
  wm2faSetup, wm2faVerify, wm2faDisable,
  wmSetRecoveryEmail, wmEmail2faSetup, wmEmail2faVerify, wmEmail2faDisable,
  wmSessions, wmRevokeSession, wmRevokeOtherSessions, type WmSession,
  wmSecurityLog, type SecurityEvent,
  wmPasskeys, wmPasskeyRegisterOptions, wmPasskeyRegister, wmDeletePasskey, type Passkey,
  WmError,
} from "./api";
import { useWebmail } from "./store";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { toast } from "@/components/ui/toast";

/** Security: recovery email, authenticator (TOTP) 2FA, and email-OTP 2FA. */
export function TwoFactor() {
  const profile = useWebmail((s) => s.profile);
  const setProfile = useWebmail((s) => s.setProfile);
  const totpEnabled = profile?.totpEnabled;
  const emailOtpEnabled = profile?.emailOtpEnabled;
  const recoveryEmail = profile?.recoveryEmail ?? "";
  const patch = (p: Partial<NonNullable<typeof profile>>) => { if (profile) setProfile({ ...profile, ...p }); };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
      <RecoveryEmailCard current={recoveryEmail} onSaved={(e) => patch({ recoveryEmail: e })} />
      <PasskeysCard />
      <AuthenticatorCard enabled={!!totpEnabled} onChange={(v) => patch({ totpEnabled: v })} />
      <EmailOtpCard enabled={!!emailOtpEnabled} hasRecovery={!!recoveryEmail} onChange={(v) => patch({ emailOtpEnabled: v })} />
      <SessionsCard />
      <ActivityCard />
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  login: "Signed in",
  login_new_device: "Signed in from a new device",
  "2fa_enabled": "Two-factor enabled",
  "2fa_disabled": "Two-factor disabled",
  password_changed: "Password changed",
  recovery_email_changed: "Recovery email changed",
  app_password_created: "App password created",
  app_password_revoked: "App password revoked",
  session_revoked: "Session signed out",
};

function ActivityCard() {
  const { data, isLoading } = useQuery({ queryKey: ["wm", "security-log"], queryFn: wmSecurityLog });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Recent security activity</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-text-secondary">Loading…</p>
          : !data || data.length === 0 ? <p className="text-sm text-text-secondary">No activity recorded yet.</p>
          : (
            <ul className="divide-y divide-border text-sm">
              {data.map((e: SecurityEvent, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <span className={e.type === "login_new_device" ? "font-medium text-warning" : ""}>
                    {EVENT_LABEL[e.type] ?? e.type}{e.detail ? ` · ${e.detail}` : ""}
                  </span>
                  <span className="shrink-0 text-right text-xs text-text-secondary">{e.ip ?? ""} · {new Date(e.ts).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
      </CardContent>
    </Card>
  );
}

/** Friendly "Chrome on Windows" label from a raw User-Agent string. */
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /edg/i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" :
    /safari/i.test(ua) ? "Safari" : "Browser";
  const os =
    /windows/i.test(ua) ? "Windows" : /android/i.test(ua) ? "Android" : /iphone|ipad|ios/i.test(ua) ? "iOS" :
    /mac os|macintosh/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function SessionsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["wm", "sessions"], queryFn: wmSessions });
  const revoke = useMutation({
    mutationFn: (id: string) => wmRevokeSession(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "sessions"] }); toast.success("Session signed out."); },
  });
  const revokeOthers = useMutation({
    mutationFn: wmRevokeOtherSessions,
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["wm", "sessions"] }); toast.success(`Signed out ${r.revoked} other session${r.revoked === 1 ? "" : "s"}.`); },
  });
  const fmt = (iso: string) => new Date(iso).toLocaleString();

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Monitor className="h-4 w-4" /> Active sessions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">Devices currently signed in to your mailbox. If you see something you don't recognise, sign it out and change your password.</p>
        {isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : (
          <ul className="divide-y divide-border">
            {(data ?? []).map((s: WmSession) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {deviceLabel(s.ua)}
                    {s.current && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">This device</span>}
                  </div>
                  <div className="truncate text-xs text-text-secondary">{s.ip ?? "unknown IP"} · last active {fmt(s.lastSeenAt)}</div>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" className="text-danger" onClick={() => revoke.mutate(s.id)} loading={revoke.isPending && revoke.variables === s.id}>Sign out</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {(data?.length ?? 0) > 1 && (
          <Button variant="outline" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending}><LogOut className="h-4 w-4" /> Sign out all other sessions</Button>
        )}
      </CardContent>
    </Card>
  );
}

function RecoveryEmailCard({ current, onSaved }: { current: string; onSaved: (email: string) => void }) {
  const [email, setEmail] = useState(current);
  const save = useMutation({
    mutationFn: () => wmSetRecoveryEmail(email.trim()),
    onSuccess: (d) => { onSaved(d.recoveryEmail); toast.success("Recovery email saved."); },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Could not save."),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Recovery email</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">Used for account recovery and for the email-code 2FA option below. Use an address you can always access.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input type="email" placeholder="you@another-domain.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!email.trim() || email.trim() === current}>Save</Button>
        </div>
        {current && <p className="text-xs text-text-secondary">Current: {current}</p>}
      </CardContent>
    </Card>
  );
}

function PasskeysCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["wm", "passkeys"], queryFn: wmPasskeys });
  const [adding, setAdding] = useState(false);

  async function addPasskey() {
    setAdding(true);
    try {
      const options = await wmPasskeyRegisterOptions();
      const response = await startRegistration({ optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON });
      const name = `${navigator.platform || "Device"} · ${new Date().toLocaleDateString()}`;
      await wmPasskeyRegister(name, response);
      qc.invalidateQueries({ queryKey: ["wm", "passkeys"] });
      toast.success("Passkey added.");
    } catch (e) {
      if (e instanceof WmError) toast.error(e.message);
      else toast.error("Passkey setup was cancelled or isn't supported on this device.");
    } finally { setAdding(false); }
  }
  const remove = useMutation({
    mutationFn: (id: string) => wmDeletePasskey(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "passkeys"] }); toast.success("Passkey removed."); },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Fingerprint className="h-4 w-4" /> Passkeys (Face ID / Windows Hello / security key)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-text-secondary">The strongest, phishing-proof second factor. After your password, approve sign-in with your device biometrics or a security key.</p>
        {isLoading ? <p className="text-sm text-text-secondary">Loading…</p> : (data?.length ?? 0) > 0 && (
          <ul className="divide-y divide-border">
            {data!.map((p: Passkey) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium"><Fingerprint className="h-4 w-4 text-text-secondary" /> {p.name}</div>
                  <div className="text-xs text-text-secondary">Added {new Date(p.createdAt).toLocaleDateString()}{p.lastUsedAt ? ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : ""}</div>
                </div>
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => remove.mutate(p.id)} loading={remove.isPending && remove.variables === p.id}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
        <Button onClick={addPasskey} loading={adding}><Fingerprint className="h-4 w-4" /> Add a passkey</Button>
      </CardContent>
    </Card>
  );
}

function AuthenticatorCard({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  const [setup, setSetup] = useState<{ qrDataUrl: string; recoveryCodes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const start = useMutation({ mutationFn: wm2faSetup, onSuccess: setSetup });
  const verify = useMutation({
    mutationFn: () => wm2faVerify(code),
    onSuccess: () => { onChange(true); setSetup(null); setCode(""); toast.success("Authenticator 2FA enabled."); },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Invalid code."),
  });
  const disable = useMutation({ mutationFn: wm2faDisable, onSuccess: () => { onChange(false); toast.success("Authenticator 2FA disabled."); } });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Authenticator app (TOTP)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {enabled ? (
          <>
            <Alert tone="success">Authenticator 2FA is on.</Alert>
            <Button variant="outline" onClick={() => disable.mutate()} loading={disable.isPending}>Turn off</Button>
          </>
        ) : !setup ? (
          <>
            <p className="text-sm text-text-secondary">Protect your mailbox with Google Authenticator, Authy, or any TOTP app.</p>
            <Button onClick={() => start.mutate()} loading={start.isPending}>Set up authenticator</Button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">Scan with your authenticator app, then enter a code to confirm.</p>
            <img src={setup.qrDataUrl} alt="TOTP QR" className="h-44 w-44 rounded-md border border-border bg-white p-2" />
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs text-text-secondary"><KeyRound className="h-3.5 w-3.5" /> Backup recovery codes (save these):</p>
              <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-elevated p-2 font-mono text-xs">
                {setup.recoveryCodes.map((c) => <span key={c}>{c}</span>)}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1"><Label htmlFor="c2">Code</Label><Input id="c2" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" className="font-mono" /></div>
              <Button onClick={() => verify.mutate()} loading={verify.isPending} disabled={code.length !== 6}>Verify</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmailOtpCard({ enabled, hasRecovery, onChange }: { enabled: boolean; hasRecovery: boolean; onChange: (v: boolean) => void }) {
  const [sent, setSent] = useState<string | null>(null); // masked hint once sent
  const [code, setCode] = useState("");
  const start = useMutation({
    mutationFn: wmEmail2faSetup,
    onSuccess: (d) => { setSent(d.hint); toast.success("Verification code sent."); },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Could not send the code."),
  });
  const verify = useMutation({
    mutationFn: () => wmEmail2faVerify(code),
    onSuccess: () => { onChange(true); setSent(null); setCode(""); toast.success("Email 2FA enabled."); },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Invalid code."),
  });
  const disable = useMutation({ mutationFn: wmEmail2faDisable, onSuccess: () => { onChange(false); toast.success("Email 2FA disabled."); } });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Email code (sent to recovery email)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {enabled ? (
          <>
            <Alert tone="success">Email-code 2FA is on. A code is emailed to your recovery address at sign-in.</Alert>
            <Button variant="outline" onClick={() => disable.mutate()} loading={disable.isPending}>Turn off</Button>
          </>
        ) : !hasRecovery ? (
          <p className="text-sm text-text-secondary">Add a <strong>recovery email</strong> above first, then you can enable email-code 2FA.</p>
        ) : !sent ? (
          <>
            <p className="text-sm text-text-secondary">Get a one-time code emailed to your recovery address each time you sign in. Good if you don't want an authenticator app.</p>
            <Button onClick={() => start.mutate()} loading={start.isPending}>Send a test code</Button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">We sent a code to {sent}. Enter it to turn on email 2FA.</p>
            <div className="flex items-end gap-2">
              <div className="flex-1"><Label htmlFor="ce">Code</Label><Input id="ce" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" className="font-mono" /></div>
              <Button onClick={() => verify.mutate()} loading={verify.isPending} disabled={code.length !== 6}>Verify</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

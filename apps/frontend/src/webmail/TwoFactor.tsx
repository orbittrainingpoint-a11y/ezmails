import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck, Smartphone, Mail, KeyRound } from "lucide-react";
import {
  wm2faSetup, wm2faVerify, wm2faDisable,
  wmSetRecoveryEmail, wmEmail2faSetup, wmEmail2faVerify, wmEmail2faDisable,
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
      <AuthenticatorCard enabled={!!totpEnabled} onChange={(v) => patch({ totpEnabled: v })} />
      <EmailOtpCard enabled={!!emailOtpEnabled} hasRecovery={!!recoveryEmail} onChange={(v) => patch({ emailOtpEnabled: v })} />
    </div>
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

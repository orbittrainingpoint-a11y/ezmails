import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { wm2faSetup, wm2faVerify, wm2faDisable, WmError } from "./api";
import { useWebmail } from "./store";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { toast } from "@/components/ui/toast";

/** Google Authenticator (TOTP) 2FA for the mailbox account. */
export function TwoFactor() {
  const enabled = useWebmail((s) => s.profile?.totpEnabled);
  const setProfile = useWebmail((s) => s.setProfile);
  const profile = useWebmail((s) => s.profile);
  const [setup, setSetup] = useState<{ qrDataUrl: string; recoveryCodes: string[] } | null>(null);
  const [code, setCode] = useState("");

  const start = useMutation({ mutationFn: wm2faSetup, onSuccess: setSetup });
  const verify = useMutation({
    mutationFn: () => wm2faVerify(code),
    onSuccess: () => {
      if (profile) setProfile({ ...profile, totpEnabled: true });
      setSetup(null);
      toast.success("Two-factor authentication enabled.");
    },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Invalid code."),
  });
  const disable = useMutation({
    mutationFn: wm2faDisable,
    onSuccess: () => { if (profile) setProfile({ ...profile, totpEnabled: false }); toast.success("2FA disabled."); },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Two-factor authentication</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {enabled ? (
          <>
            <Alert tone="success">2FA with Google Authenticator is enabled.</Alert>
            <Button variant="outline" onClick={() => disable.mutate()} loading={disable.isPending}>Disable 2FA</Button>
          </>
        ) : !setup ? (
          <>
            <p className="text-sm text-text-secondary">Protect your mailbox with Google Authenticator (or any TOTP app).</p>
            <Button onClick={() => start.mutate()} loading={start.isPending}>Enable 2FA</Button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">Scan with Google Authenticator, then enter a code to confirm.</p>
            <img src={setup.qrDataUrl} alt="TOTP QR" className="h-44 w-44 rounded-md border border-border bg-white p-2" />
            <div>
              <p className="mb-1 text-xs text-text-secondary">Backup recovery codes (save these):</p>
              <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-elevated p-2 font-mono text-xs">
                {setup.recoveryCodes.map((c) => <span key={c}>{c}</span>)}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1"><Label htmlFor="c2">Code</Label><Input id="c2" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono" /></div>
              <Button onClick={() => verify.mutate()} loading={verify.isPending} disabled={code.length !== 6}>Verify</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

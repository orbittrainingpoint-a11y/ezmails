import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Fingerprint } from "lucide-react";
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { BrandLogo } from "@/components/BrandLogo";
import { wmLogin, wmMfa, wmMfaPasskey, wmMfaSendEmailCode, isMfaChallenge, WmError } from "./api";
import { useWebmail } from "./store";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { ThemeToggle } from "@/components/ThemeToggle";

export function WebmailLogin() {
  const navigate = useNavigate();
  const setProfile = useWebmail((s) => s.setProfile);
  const [error, setError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [methods, setMethods] = useState<string[]>([]);
  const [mfaMethod, setMfaMethod] = useState<"totp" | "email">("totp"); // active code source
  const [mfaHint, setMfaHint] = useState<string | undefined>(undefined);
  const [passkeyOptions, setPasskeyOptions] = useState<unknown>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState } = useForm<{ email: string; password: string }>();

  function done(res: { profile: { email: string; displayName: string | null } }) {
    setProfile(res.profile);
    navigate("/webmail", { replace: true });
  }

  async function onSubmit(v: { email: string; password: string }) {
    setError(null);
    try {
      const res = await wmLogin(v.email, v.password);
      if (isMfaChallenge(res)) {
        setMfaToken(res.mfaToken);
        setMethods(res.methods ?? (res.method ? [res.method] : ["totp"]));
        setMfaMethod(res.method === "email" ? "email" : "totp");
        setMfaHint(res.hint);
        setPasskeyOptions(res.passkeyOptions ?? null);
        setEmailSent(res.method === "email");
        return;
      }
      done(res);
    } catch (e) {
      setError(e instanceof WmError ? e.message : "Login failed.");
    }
  }

  async function onMfa() {
    if (!mfaToken) return;
    setBusy(true); setError(null);
    try { done(await wmMfa(mfaToken, code.trim())); }
    catch (e) { setError(e instanceof WmError ? e.message : "Invalid code."); }
    finally { setBusy(false); }
  }

  async function onPasskey() {
    if (!mfaToken || !passkeyOptions) return;
    setBusy(true); setError(null);
    try {
      const assertion = await startAuthentication({ optionsJSON: passkeyOptions as PublicKeyCredentialRequestOptionsJSON });
      done(await wmMfaPasskey(mfaToken, assertion));
    } catch (e) {
      setError(e instanceof WmError ? e.message : "Passkey sign-in was cancelled or failed.");
    } finally { setBusy(false); }
  }

  async function onSendEmail() {
    if (!mfaToken) return;
    setError(null);
    try {
      const r = await wmMfaSendEmailCode(mfaToken);
      setMfaMethod("email"); setMfaHint(r.hint); setEmailSent(true); setCode("");
    } catch (e) {
      setError(e instanceof WmError ? e.message : "Could not send the code.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary">
            <BrandLogo className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold">Infinit Email</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-md">
          <h1 className="mb-6 text-center text-xl font-semibold">
            {mfaToken ? "Two-factor authentication" : "Sign in to your mailbox"}
          </h1>
          {mfaToken ? (
            <div className="space-y-4">
              {error && <Alert tone="danger">{error}</Alert>}

              {methods.includes("passkey") && (
                <Button className="w-full" onClick={onPasskey} loading={busy}>
                  <Fingerprint className="h-4 w-4" /> Use your passkey
                </Button>
              )}

              {(methods.includes("totp") || methods.includes("email")) && (
                <>
                  {methods.includes("passkey") && <div className="text-center text-xs text-text-secondary">or use a code</div>}
                  {(methods.includes("totp") || emailSent) ? (
                    <>
                      <p className="text-sm text-text-secondary">
                        {mfaMethod === "email"
                          ? `Enter the 6-digit code we emailed to ${mfaHint ?? "your recovery email"}.`
                          : "Enter the 6-digit code from your authenticator app."}
                      </p>
                      <Input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        placeholder={mfaMethod === "email" ? "123456" : "123456 or recovery code"}
                        className="text-center font-mono tracking-widest"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onMfa()}
                      />
                      <Button className="w-full" onClick={onMfa} loading={busy} disabled={!code.trim()}>Verify</Button>
                    </>
                  ) : null}
                  {methods.includes("email") && !emailSent && (
                    <button onClick={onSendEmail} className="w-full text-center text-sm text-primary hover:underline">
                      Email me a one-time code{mfaHint ? ` (${mfaHint})` : ""}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && <Alert tone="danger">{error}</Alert>}
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" autoFocus {...register("email", { required: true })} />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" {...register("password", { required: true })} />
              </div>
              <Button type="submit" className="w-full" loading={formState.isSubmitting}>
                Sign in
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

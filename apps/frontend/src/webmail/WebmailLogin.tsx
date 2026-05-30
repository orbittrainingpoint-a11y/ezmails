import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { wmLogin, wmMfa, isMfaChallenge, WmError } from "./api";
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
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState } = useForm<{ email: string; password: string }>();

  async function onSubmit(v: { email: string; password: string }) {
    setError(null);
    try {
      const res = await wmLogin(v.email, v.password);
      if (isMfaChallenge(res)) {
        setMfaToken(res.mfaToken);
        return;
      }
      setProfile(res.profile);
      navigate("/webmail", { replace: true });
    } catch (e) {
      setError(e instanceof WmError ? e.message : "Login failed.");
    }
  }

  async function onMfa() {
    if (!mfaToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await wmMfa(mfaToken, code.trim());
      setProfile(res.profile);
      navigate("/webmail", { replace: true });
    } catch (e) {
      setError(e instanceof WmError ? e.message : "Invalid code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary">
            <Mail className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold">ezmails webmail</span>
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
              <p className="text-sm text-text-secondary">Enter the 6-digit code from Google Authenticator.</p>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456 or recovery code"
                className="text-center font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onMfa()}
              />
              <Button className="w-full" onClick={onMfa} loading={busy}>Verify</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && <Alert tone="danger">{error}</Alert>}
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoFocus {...register("email", { required: true })} />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" {...register("password", { required: true })} />
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

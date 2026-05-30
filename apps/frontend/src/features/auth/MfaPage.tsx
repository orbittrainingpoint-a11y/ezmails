import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/stores/auth";
import { ApiError } from "@/lib/api";
import { verifyMfa } from "./api";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";

interface MfaState {
  mfaToken?: string;
  rememberMe?: boolean;
}

export function MfaPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: MfaState | null };
  const setAuth = useAuth((s) => s.setAuth);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<{ code: string }>();

  // No challenge token → user landed here directly; send them back to login.
  if (!state?.mfaToken) return <Navigate to="/login" replace />;

  async function onSubmit({ code }: { code: string }) {
    setError(null);
    try {
      const result = await verifyMfa(state!.mfaToken!, code.trim(), state?.rememberMe ?? false);
      setAuth(result.user, result.accessToken);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed.");
    }
  }

  return (
    <AuthLayout title="Two-factor authentication" subtitle="Enter the 6-digit code from your authenticator app">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div>
          <Label htmlFor="code">Authentication code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456 or recovery code"
            className="text-center font-mono tracking-widest"
            {...register("code", { required: true })}
          />
        </div>
        <Button type="submit" className="w-full" loading={formState.isSubmitting}>
          Verify
        </Button>
      </form>
    </AuthLayout>
  );
}

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "./api";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState } = useForm<{ email: string }>();

  async function onSubmit({ email }: { email: string }) {
    await requestPasswordReset(email).catch(() => undefined);
    setSent(true); // Always succeed — no account enumeration.
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a reset link">
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success">If an account exists for that email, a reset link is on its way.</Alert>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoFocus {...register("email", { required: true })} />
          </div>
          <Button type="submit" className="w-full" loading={formState.isSubmitting}>
            Send reset link
          </Button>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}

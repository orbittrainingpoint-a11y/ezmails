import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { resetPassword } from "./api";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";

const schema = z
  .object({
    password: z.string().min(8, "At least 8 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match.", path: ["confirm"] });
type Form = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit({ password }: Form) {
    setError(null);
    try {
      await resetPassword(token, password);
      navigate("/login", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Reset failed.");
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Invalid link">
        <Alert tone="danger">This reset link is missing or invalid.</Alert>
        <Link to="/forgot-password" className="mt-4 block text-center text-sm text-primary hover:underline">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" autoFocus {...register("password")} />
          {formState.errors.password && <p className="mt-1 text-xs text-danger">{formState.errors.password.message}</p>}
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
          {formState.errors.confirm && <p className="mt-1 text-xs text-danger">{formState.errors.confirm.message}</p>}
        </div>
        <Button type="submit" className="w-full" loading={formState.isSubmitting}>
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}

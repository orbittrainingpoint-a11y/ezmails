import { Navigate } from "react-router-dom";
import { useAuth } from "@/stores/auth";
import { AppShell } from "@/components/layout/AppShell";
import { FullPageSpinner } from "@/components/ui/Spinner";

/** Gate for authenticated areas: waits for hydration, then requires a user. */
export function ProtectedRoute() {
  const { user, hydrated } = useAuth();
  if (!hydrated) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

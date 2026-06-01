import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type Role } from "@/stores/auth";

/** Where each role lands by default (the index redirect + fallback for blocked routes). */
const HOME: Record<Role, string> = {
  super_admin: "/dashboard",
  reseller: "/dashboard",
  customer: "/mailboxes",
};

export function roleHome(role: Role | undefined): string {
  return role ? HOME[role] : "/login";
}

/** Redirect the index "/" to the right landing page for the signed-in role. */
export function IndexRedirect() {
  const { user } = useAuth();
  return <Navigate to={roleHome(user?.role)} replace />;
}

/** Gate a route to specific roles; others are bounced to their own home (no error page). */
export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;
  return <>{children}</>;
}

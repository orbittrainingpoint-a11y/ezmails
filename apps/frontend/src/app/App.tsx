import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useBootstrapAuth } from "@/features/auth/useBootstrapAuth";
import { ProtectedRoute } from "./ProtectedRoute";
import { RoleGate, IndexRedirect } from "./RoleGate";
import { Toaster } from "@/components/ui/toast";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LoginPage } from "@/features/auth/LoginPage";
import { MfaPage } from "@/features/auth/MfaPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { DomainsPage } from "@/features/domains/DomainsPage";
import { DomainDetailPage } from "@/features/domains/DomainDetailPage";
import { MailboxesPage } from "@/features/mailboxes/MailboxesPage";
import { CustomersPage } from "@/features/customers/CustomersPage";
import { QueuePage } from "@/features/ops/QueuePage";
import { LogsPage } from "@/features/ops/LogsPage";
import { NodesPage } from "@/features/ops/NodesPage";
import { SpamPage } from "@/features/ops/SpamPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { WebmailApp } from "@/webmail/WebmailApp";
import { WebmailLogin } from "@/webmail/WebmailLogin";
import { BookingPage } from "@/webmail/BookingPage";

// Shared authenticated pages, role-gated (used by both the secret-path admin router
// and the dev combined router). Non-permitted roles are bounced to their own home.
function adminPages() {
  return (
    <>
      <Route index element={<IndexRedirect />} />
      <Route path="/dashboard" element={<RoleGate roles={["super_admin", "reseller"]}><DashboardPage /></RoleGate>} />
      <Route path="/domains" element={<RoleGate roles={["super_admin", "reseller"]}><DomainsPage /></RoleGate>} />
      <Route path="/domains/:id" element={<RoleGate roles={["super_admin", "reseller"]}><DomainDetailPage /></RoleGate>} />
      <Route path="/mailboxes" element={<MailboxesPage />} />
      <Route path="/customers" element={<RoleGate roles={["super_admin", "reseller"]}><CustomersPage /></RoleGate>} />
      <Route path="/nodes" element={<RoleGate roles={["super_admin"]}><NodesPage /></RoleGate>} />
      <Route path="/queue" element={<RoleGate roles={["super_admin"]}><QueuePage /></RoleGate>} />
      <Route path="/logs" element={<RoleGate roles={["super_admin"]}><LogsPage /></RoleGate>} />
      <Route path="/spam" element={<RoleGate roles={["super_admin"]}><SpamPage /></RoleGate>} />
      <Route path="/settings" element={<SettingsPage />} />
    </>
  );
}

// Secret base path the admin panel is mounted under in production (e.g. "/control-a7f3k9").
// Injected at build time via VITE_ADMIN_BASE. When empty (local dev), the app falls back to
// the combined router where the admin panel lives at "/" and webmail at "/webmail".
const ADMIN_BASE = (import.meta.env.VITE_ADMIN_BASE ?? "").replace(/\/+$/, "");

/** Admin control-panel routes. Mounted under ADMIN_BASE in production. */
function AdminRouting() {
  useBootstrapAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>{adminPages()}</Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** End-user webmail + public pages. Mounted at the site root (the common URL). */
function WebmailRouting() {
  return (
    <Routes>
      {/* Public booking page (no auth) */}
      <Route path="/book/:slug" element={<BookingPage />} />
      {/* Webmail (end-user client) */}
      <Route path="/webmail/login" element={<WebmailLogin />} />
      <Route path="/webmail/*" element={<WebmailApp />} />
      {/* Root is the webmail entry point. */}
      <Route path="/" element={<Navigate to="/webmail" replace />} />
      <Route path="*" element={<Navigate to="/webmail" replace />} />
    </Routes>
  );
}

/** Dev / no-secret-path fallback: admin at "/", webmail at "/webmail". */
function CombinedRouting() {
  useBootstrapAuth();
  return (
    <Routes>
      <Route path="/book/:slug" element={<BookingPage />} />
      <Route path="/webmail/login" element={<WebmailLogin />} />
      <Route path="/webmail/*" element={<WebmailApp />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>{adminPages()}</Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Root() {
  // No secret path configured → combined router (local dev).
  if (!ADMIN_BASE) {
    return (
      <BrowserRouter>
        <CombinedRouting />
      </BrowserRouter>
    );
  }
  // Production: the admin panel lives under ADMIN_BASE; everything else is webmail.
  const path = window.location.pathname;
  const isAdmin = path === ADMIN_BASE || path.startsWith(`${ADMIN_BASE}/`);
  return isAdmin ? (
    <BrowserRouter basename={ADMIN_BASE}>
      <AdminRouting />
    </BrowserRouter>
  ) : (
    <BrowserRouter>
      <WebmailRouting />
    </BrowserRouter>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
      <Toaster />
      <InstallPrompt />
    </QueryClientProvider>
  );
}

import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Globe,
  Mailbox,
  Users,
  Server,
  ListChecks,
  ScrollText,
  ShieldAlert,
  Settings,
  Mail,
  LogOut,
  Menu,
} from "lucide-react";
import { useAuth, type Role } from "@/stores/auth";
import { logout as apiLogout } from "@/features/auth/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "reseller"] },
  { to: "/domains", label: "Domains", icon: Globe, roles: ["super_admin", "reseller"] },
  { to: "/mailboxes", label: "Mailboxes", icon: Mailbox, roles: ["super_admin", "reseller", "customer"] },
  { to: "/customers", label: "Customers", icon: Users, roles: ["super_admin", "reseller"] },
  { to: "/nodes", label: "Nodes", icon: Server, roles: ["super_admin"] },
  { to: "/queue", label: "Queue", icon: ListChecks, roles: ["super_admin"] },
  { to: "/logs", label: "Mail Log", icon: ScrollText, roles: ["super_admin"] },
  { to: "/spam", label: "Spam & Rules", icon: ShieldAlert, roles: ["super_admin"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["super_admin", "reseller", "customer"] },
];

export function AppShell() {
  const navigate = useNavigate();
  const { user, clear } = useAuth();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => (user ? n.roles.includes(user.role) : false));

  async function handleLogout() {
    await apiLogout().catch(() => undefined);
    clear();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-60 transform border-r border-border bg-surface transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary">
            <Mail className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold tracking-tight">ezmails</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-text-secondary hover:bg-elevated hover:text-text-primary",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex flex-1 items-center justify-end gap-2">
            <ThemeToggle />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-text-primary">{user?.displayName ?? user?.email}</div>
              <div className="text-xs capitalize text-text-secondary">{user?.role.replace("_", " ")}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sign out">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

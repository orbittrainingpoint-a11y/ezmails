import { useEffect, useState } from "react";
import { Routes, Route, NavLink, Navigate, useNavigate } from "react-router-dom";
import { Inbox as InboxIcon, Users, Settings as SettingsIcon, LogOut, Megaphone, CalendarDays, PanelRightOpen, HelpCircle, LayoutGrid, CheckSquare } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { wmMe, wmLogout } from "./api";
import { useWebmail } from "./store";
import { Inbox } from "./Inbox";
import { Contacts } from "./Contacts";
import { Settings } from "./Settings";
import { Campaigns } from "./Campaigns";
import { Calendar } from "./Calendar";
import { Planner } from "./Planner";
import { Tasks } from "./Tasks";
import { CalendarTasks } from "./CalendarTasks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

export function WebmailApp() {
  const { profile, hydrated, setProfile, setHydrated, clear } = useWebmail();
  const navigate = useNavigate();
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    let cancelled = false;
    wmMe()
      .then((me) => !cancelled && setProfile(me))
      .catch(() => !cancelled && clear())
      .finally(() => !cancelled && setHydrated());
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hydrated) return <FullPageSpinner />;
  if (!profile) return <Navigate to="/webmail/login" replace />;

  async function handleLogout() {
    await wmLogout().catch(() => undefined);
    clear();
    navigate("/webmail/login", { replace: true });
  }

  const navCls = ({ isActive }: { isActive: boolean }) =>
    cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium", isActive ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-elevated");

  return (
    <div className="flex h-screen flex-col overflow-x-hidden bg-base">
      <header className="flex h-14 shrink-0 items-center justify-between gap-1 border-b border-border bg-surface px-2 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary">
              <BrandLogo className="h-4 w-4 text-white" />
            </div>
            <span className="hidden font-semibold sm:inline">Infinit Email</span>
          </div>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            <NavLink to="/webmail" end className={navCls} title="Mail"><InboxIcon className="h-4 w-4" /> <span className="hidden md:inline">Mail</span></NavLink>
            <NavLink to="/webmail/calendar" className={navCls} title="Calendar"><CalendarDays className="h-4 w-4" /> <span className="hidden md:inline">Calendar</span></NavLink>
            <NavLink to="/webmail/tasks" className={navCls} title="Tasks"><CheckSquare className="h-4 w-4" /> <span className="hidden md:inline">Tasks</span></NavLink>
            <NavLink to="/webmail/planner" className={navCls} title="Planner"><LayoutGrid className="h-4 w-4" /> <span className="hidden md:inline">Planner</span></NavLink>
            <NavLink to="/webmail/contacts" className={navCls} title="Contacts"><Users className="h-4 w-4" /> <span className="hidden md:inline">Contacts</span></NavLink>
            <NavLink to="/webmail/settings" className={navCls} title="Settings"><SettingsIcon className="h-4 w-4" /> <span className="hidden md:inline">Settings</span></NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <span className="hidden text-sm text-text-secondary lg:block">{profile.email}</span>
          <Button variant="ghost" size="icon" onClick={() => navigate("/webmail/campaigns")} aria-label="Campaigns" title="Email Campaigns"><Megaphone className="h-5 w-5" /></Button>
          {/* Side panel is desktop-only; phones use the Calendar/Planner nav routes. */}
          <Button variant={showPanel ? "primary" : "ghost"} size="icon" onClick={() => setShowPanel((v) => !v)} aria-label="Calendar & Tasks" className="hidden lg:inline-flex"><PanelRightOpen className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" aria-label="Help" title="Help" className="hidden sm:inline-flex"><HelpCircle className="h-5 w-5" /></Button>
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sign out"><LogOut className="h-5 w-5" /></Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <Routes>
            <Route index element={<Inbox />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="planner" element={<Planner />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/webmail" replace />} />
          </Routes>
        </div>
        {showPanel && <CalendarTasks onClose={() => setShowPanel(false)} />}
      </div>
    </div>
  );
}

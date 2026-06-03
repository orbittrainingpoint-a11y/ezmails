import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, ChevronLeft, ChevronRight, Video, ExternalLink, Trash2, MoreVertical, Settings as SettingsIcon, Share2, X, Check,
} from "lucide-react";
import { wmGetFullSettings, wmSaveSettings, wmBookings, wmSharedCalendars } from "./api";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export interface Meeting {
  id: string; title: string; startsAt: string; endsAt: string;
  notes?: string; link?: string; calendarId?: string; allDay?: boolean;
}
export interface CalShare { email: string; perm: "view" | "edit" }
export interface UserCalendar { id: string; name: string; color: string; description?: string; visible?: boolean; shares?: CalShare[] }

const COLORS = ["#3b82f6", "#f59e0b", "#ef4444", "#22c55e", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];
const DEFAULT_CAL: UserCalendar = { id: "primary", name: "My calendar", color: "#f59e0b", visible: true };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const linkHref = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => addDays(d, -d.getDay());
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type View = "month" | "week" | "day";
interface Ev {
  id: string; title: string; start: Date; end: Date; color: string;
  allDay?: boolean; link?: string; editable: boolean; meeting?: Meeting; owner?: string;
}

export function Calendar() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const { data: bookings } = useQuery({ queryKey: ["wm", "bookings"], queryFn: wmBookings });
  const { data: shared } = useQuery({ queryKey: ["wm", "shared-calendars"], queryFn: wmSharedCalendars });

  const prefs = (settings?.prefs ?? {}) as Record<string, unknown>;
  const meetings = ((prefs.meetings as Meeting[] | undefined) ?? []);
  const rawCals = (prefs.calendars as UserCalendar[] | undefined) ?? [];
  const calendars: UserCalendar[] = rawCals.length ? rawCals : [DEFAULT_CAL];

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);
  const [settingsCal, setSettingsCal] = useState<UserCalendar | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showBookings, setShowBookings] = useState(true);
  const [hiddenShared, setHiddenShared] = useState<Set<string>>(new Set());

  const savePrefs = useMutation({
    mutationFn: (next: Record<string, unknown>) => wmSaveSettings({ prefs: { ...prefs, ...next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }),
  });

  const calColor = (id?: string) => calendars.find((c) => c.id === id)?.color ?? calendars[0]!.color;
  const visibleCalIds = new Set(calendars.filter((c) => c.visible !== false).map((c) => c.id));

  // Build the event list across all sources.
  const events: Ev[] = useMemo(() => {
    const out: Ev[] = [];
    for (const m of meetings) {
      const calId = m.calendarId ?? calendars[0]!.id;
      if (!visibleCalIds.has(calId)) continue;
      out.push({ id: m.id, title: m.title, start: new Date(m.startsAt), end: new Date(m.endsAt), color: calColor(calId), allDay: m.allDay, link: m.link, editable: true, meeting: m });
    }
    if (showBookings) {
      for (const b of bookings ?? []) {
        if (b.cancelled) continue;
        const s = new Date(b.startsAt);
        out.push({ id: `bk-${b.id}`, title: `${b.link.title} · ${b.name}`, start: s, end: new Date(s.getTime() + 30 * 60000), color: "#0ea5e9", editable: false });
      }
    }
    for (const sc of shared ?? []) {
      if (hiddenShared.has(sc.id)) continue;
      for (const e of sc.events) {
        out.push({ id: `${sc.id}-${e.id}`, title: e.title, start: new Date(e.startsAt), end: new Date(e.endsAt), color: sc.color, link: e.link, editable: false, owner: sc.ownerName ?? sc.ownerEmail });
      }
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, bookings, shared, showBookings, hiddenShared, rawCals]);

  const eventsOn = (d: Date) => events.filter((e) => sameDay(e.start, d));

  const openNew = (date?: string) => { setEditing(null); setDefaultDate(date); setDialogOpen(true); };
  const openEvent = (ev: Ev) => { if (ev.editable && ev.meeting) { setEditing(ev.meeting); setDialogOpen(true); } };

  const move = (dir: number) => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * (view === "week" ? 7 : 1));
    setCursor(d);
  };

  const toggleCal = (id: string) => {
    const next = calendars.map((c) => (c.id === id ? { ...c, visible: c.visible === false } : c));
    savePrefs.mutate({ calendars: next });
  };
  const addCalendar = () => {
    const cal: UserCalendar = { id: crypto.randomUUID(), name: "New calendar", color: COLORS[(calendars.length) % COLORS.length]!, visible: true };
    savePrefs.mutate({ calendars: [...(rawCals.length ? rawCals : [DEFAULT_CAL]), cal] });
    setSettingsCal(cal);
  };

  const title = view === "month"
    ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : view === "day"
      ? cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
      : `${startOfWeek(cursor).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(startOfWeek(cursor), 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Today</Button>
        <div className="flex items-center">
          <button onClick={() => move(-1)} className="rounded-md p-1.5 hover:bg-elevated" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => move(1)} className="rounded-md p-1.5 hover:bg-elevated" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(["day", "week", "month"] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn("rounded px-2.5 py-1 text-xs font-medium capitalize", view === v ? "bg-primary text-white" : "text-text-secondary hover:bg-elevated")}>{v}</button>
            ))}
          </div>
          <Button size="sm" onClick={() => openNew()}><Plus className="h-4 w-4" /> New Event</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="hidden w-60 shrink-0 flex-col gap-4 overflow-auto border-r border-border p-3 lg:flex">
          <MiniMonth cursor={cursor} onPick={(d) => { setCursor(d); setView("day"); }} />
          <div>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">My Calendars</span>
              <button onClick={addCalendar} className="rounded p-1 text-text-secondary hover:bg-elevated" aria-label="Add calendar"><Plus className="h-4 w-4" /></button>
            </div>
            <ul className="space-y-0.5">
              {calendars.map((c) => (
                <li key={c.id} className="group relative flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-elevated">
                  <button onClick={() => toggleCal(c.id)} className="flex min-w-0 flex-1 items-center gap-2" title={c.visible === false ? "Show" : "Hide"}>
                    <span className="flex h-4 w-4 items-center justify-center rounded" style={{ backgroundColor: c.visible === false ? "transparent" : c.color, border: `1.5px solid ${c.color}` }}>
                      {c.visible !== false && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="truncate text-sm">{c.name}</span>
                  </button>
                  <button onClick={() => setMenuFor(menuFor === c.id ? null : c.id)} className="opacity-0 group-hover:opacity-100" aria-label="Calendar menu"><MoreVertical className="h-4 w-4 text-text-secondary" /></button>
                  {menuFor === c.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                      <div className="absolute right-0 top-7 z-20 w-44 rounded-md border border-border bg-surface py-1 shadow-md">
                        <button onClick={() => { setSettingsCal(c); setMenuFor(null); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-elevated"><SettingsIcon className="h-4 w-4" /> Settings & sharing</button>
                        {calendars.length > 1 && (
                          <button onClick={() => { savePrefs.mutate({ calendars: calendars.filter((x) => x.id !== c.id), meetings: meetings.map((m) => (m.calendarId === c.id ? { ...m, calendarId: calendars[0]!.id } : m)) }); setMenuFor(null); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-danger hover:bg-elevated"><Trash2 className="h-4 w-4" /> Delete</button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
              {/* Bookings pseudo-calendar */}
              <li className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-elevated">
                <button onClick={() => setShowBookings((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded" style={{ backgroundColor: showBookings ? "#0ea5e9" : "transparent", border: "1.5px solid #0ea5e9" }}>{showBookings && <Check className="h-3 w-3 text-white" />}</span>
                  <span className="truncate text-sm">Bookings</span>
                </button>
              </li>
            </ul>
          </div>

          {(shared?.length ?? 0) > 0 && (
            <div>
              <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">Shared with me</div>
              <ul className="space-y-0.5">
                {shared!.map((sc) => (
                  <li key={sc.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-elevated">
                    <button onClick={() => setHiddenShared((s) => { const n = new Set(s); n.has(sc.id) ? n.delete(sc.id) : n.add(sc.id); return n; })} className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="flex h-4 w-4 items-center justify-center rounded" style={{ backgroundColor: hiddenShared.has(sc.id) ? "transparent" : sc.color, border: `1.5px solid ${sc.color}` }}>{!hiddenShared.has(sc.id) && <Check className="h-3 w-3 text-white" />}</span>
                      <span className="min-w-0 truncate text-sm">{sc.name} <span className="text-text-secondary">· {sc.ownerName ?? sc.ownerEmail}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Grid */}
        <div className="min-w-0 flex-1 overflow-auto">
          {view === "month" && <MonthGrid cursor={cursor} eventsOn={eventsOn} onDay={(d) => openNew(ymd(d))} onEvent={openEvent} onMore={(d) => { setCursor(d); setView("day"); }} />}
          {view === "week" && <WeekGrid cursor={cursor} eventsOn={eventsOn} onDay={(d) => openNew(ymd(d))} onEvent={openEvent} />}
          {view === "day" && <DayView cursor={cursor} events={eventsOn(cursor)} onNew={() => openNew(ymd(cursor))} onEvent={openEvent} />}
        </div>
      </div>

      <EventDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} defaultDate={defaultDate}
        calendars={calendars} prefs={prefs} meetings={meetings} />
      {settingsCal && (
        <CalendarSettingsDialog cal={settingsCal} calendars={calendars} prefs={prefs} onClose={() => setSettingsCal(null)} />
      )}
    </div>
  );
}

function EventChip({ ev, onClick }: { ev: Ev; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs hover:opacity-80"
      style={{ backgroundColor: `${ev.color}22`, color: ev.color }} title={ev.title}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ev.color }} />
      {!ev.allDay && <span className="shrink-0 tabular-nums">{hm(ev.start)}</span>}
      <span className="truncate">{ev.title}</span>
    </button>
  );
}

function MonthGrid({ cursor, eventsOn, onDay, onEvent, onMore }: {
  cursor: Date; eventsOn: (d: Date) => Ev[]; onDay: (d: Date) => void; onEvent: (e: Ev) => void; onMore: (d: Date) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = new Date();
  return (
    <div className="grid h-full grid-rows-[auto,1fr]">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((w) => <div key={w} className="px-2 py-1.5 text-xs font-medium text-text-secondary">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const evs = eventsOn(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <button key={i} onClick={() => onDay(d)} className={cn("flex flex-col gap-0.5 border-b border-r border-border p-1 text-left align-top hover:bg-elevated/50", !inMonth && "bg-base/40")}>
              <span className={cn("mb-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", sameDay(d, today) ? "bg-primary font-semibold text-white" : inMonth ? "text-text-primary" : "text-text-secondary")}>{d.getDate()}</span>
              <div className="space-y-0.5">
                {evs.slice(0, 3).map((e) => <EventChip key={e.id} ev={e} onClick={() => onEvent(e)} />)}
                {evs.length > 3 && <button onClick={(ev) => { ev.stopPropagation(); onMore(d); }} className="px-1 text-[11px] text-text-secondary hover:underline">+{evs.length - 3} more</button>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({ cursor, eventsOn, onDay, onEvent }: { cursor: Date; eventsOn: (d: Date) => Ev[]; onDay: (d: Date) => void; onEvent: (e: Ev) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));
  const today = new Date();
  return (
    <div className="grid h-full grid-cols-7">
      {days.map((d, i) => (
        <button key={i} onClick={() => onDay(d)} className="flex flex-col border-r border-border text-left hover:bg-elevated/30">
          <div className={cn("border-b border-border p-2 text-center", sameDay(d, today) && "text-primary")}>
            <div className="text-xs text-text-secondary">{WEEKDAYS[d.getDay()]}</div>
            <div className={cn("mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm", sameDay(d, today) && "bg-primary font-semibold text-white")}>{d.getDate()}</div>
          </div>
          <div className="flex-1 space-y-1 p-1.5">
            {eventsOn(d).map((e) => <EventChip key={e.id} ev={e} onClick={() => onEvent(e)} />)}
          </div>
        </button>
      ))}
    </div>
  );
}

function DayView({ cursor, events, onNew, onEvent }: { cursor: Date; events: Ev[]; onNew: () => void; onEvent: (e: Ev) => void }) {
  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-text-secondary">{cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
        <Button size="sm" variant="outline" onClick={onNew}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      {events.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-12 text-center text-sm text-text-secondary">No events this day.</div>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <button onClick={() => onEvent(e)} className="flex w-full items-center gap-3 rounded-md border border-border bg-surface p-3 text-left hover:border-primary" style={{ borderLeftColor: e.color, borderLeftWidth: 3 }}>
                <div className="w-16 shrink-0 text-sm tabular-nums text-text-secondary">{e.allDay ? "All day" : hm(e.start)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{e.title}</div>
                  {e.owner && <div className="text-xs text-text-secondary">from {e.owner}</div>}
                  {e.link && <a href={linkHref(e.link)} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" /> {e.link}</a>}
                </div>
                {e.link && <span className="shrink-0 text-primary"><Video className="h-4 w-4" /></span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniMonth({ cursor, onPick }: { cursor: Date; onPick: (d: Date) => void }) {
  const [m, setM] = useState(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const start = startOfWeek(new Date(m.getFullYear(), m.getMonth(), 1));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = new Date();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <button onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="rounded p-1 hover:bg-elevated"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <span className="text-sm font-semibold">{m.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="rounded p-1 hover:bg-elevated"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-text-secondary">{WEEKDAYS.map((w) => <span key={w}>{w[0]}</span>)}</div>
      <div className="grid grid-cols-7 text-center">
        {days.map((d, i) => (
          <button key={i} onClick={() => onPick(d)} className={cn("aspect-square rounded-full text-xs hover:bg-elevated", sameDay(d, today) ? "bg-primary text-white" : d.getMonth() === m.getMonth() ? "text-text-primary" : "text-text-secondary")}>{d.getDate()}</button>
        ))}
      </div>
    </div>
  );
}

function EventDialog({ open, onOpenChange, editing, defaultDate, calendars, prefs, meetings }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Meeting | null; defaultDate?: string;
  calendars: UserCalendar[]; prefs: Record<string, unknown>; meetings: Meeting[];
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState(calendars[0]!.id);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("09:30");
  const [allDay, setAllDay] = useState(false);
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");

  // Reset fields whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const s = new Date(editing.startsAt), e = new Date(editing.endsAt);
      setTitle(editing.title); setCalendarId(editing.calendarId ?? calendars[0]!.id);
      setDate(ymd(s)); setStart(hm(s)); setEnd(hm(e)); setAllDay(!!editing.allDay);
      setNotes(editing.notes ?? ""); setLink(editing.link ?? "");
    } else {
      setTitle(""); setCalendarId(calendars[0]!.id); setDate(defaultDate ?? ymd(new Date()));
      setStart("09:00"); setEnd("09:30"); setAllDay(false); setNotes(""); setLink("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultDate]);

  const save = useMutation({
    mutationFn: () => {
      const startsAt = new Date(`${date}T${allDay ? "00:00" : start}`).toISOString();
      const endsAt = new Date(`${date}T${allDay ? "23:59" : end}`).toISOString();
      const m: Meeting = { id: editing?.id ?? crypto.randomUUID(), title, startsAt, endsAt, calendarId, allDay, notes: notes || undefined, link: link || undefined };
      const next = editing ? meetings.map((x) => (x.id === editing.id ? m : x)) : [...meetings, m];
      return wmSaveSettings({ prefs: { ...prefs, meetings: next } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }); toast.success(editing ? "Event updated." : "Event added."); onOpenChange(false); },
    onError: () => toast.error("Could not save event."),
  });
  const del = useMutation({
    mutationFn: () => wmSaveSettings({ prefs: { ...prefs, meetings: meetings.filter((x) => x.id !== editing?.id) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }); toast.success("Event deleted."); onOpenChange(false); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Edit event" : "New event"}>
        <div className="space-y-3">
          <div><Label htmlFor="et">Title</Label><Input id="et" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" autoFocus /></div>
          <div>
            <Label htmlFor="ec">Calendar</Label>
            <select id="ec" value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm">
              {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><Label htmlFor="ed">Date</Label><Input id="ed" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day</label>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="es">Start</Label><Input id="es" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div><Label htmlFor="ee">End</Label><Input id="ee" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
          )}
          <div><Label htmlFor="el">Meeting link (optional)</Label><Input id="el" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet…" /></div>
          <div><Label htmlFor="en">Notes</Label><Input id="en" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex items-center justify-between gap-2 pt-1">
            {editing ? <Button variant="ghost" className="text-danger" onClick={() => del.mutate()}><Trash2 className="h-4 w-4" /> Delete</Button> : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!title.trim() || !date}>{editing ? "Save" : "Add"}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CalendarSettingsDialog({ cal, calendars, prefs, onClose }: {
  cal: UserCalendar; calendars: UserCalendar[]; prefs: Record<string, unknown>; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(cal.name);
  const [description, setDescription] = useState(cal.description ?? "");
  const [color, setColor] = useState(cal.color);
  const [shares, setShares] = useState<CalShare[]>(cal.shares ?? []);
  const [shareEmail, setShareEmail] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const next = calendars.map((c) => (c.id === cal.id ? { ...c, name: name.trim() || c.name, description: description || undefined, color, shares } : c));
      return wmSaveSettings({ prefs: { ...prefs, calendars: next } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }); toast.success("Calendar saved."); onClose(); },
    onError: () => toast.error("Could not save calendar."),
  });

  const addShare = () => {
    const email = shareEmail.trim().toLowerCase();
    if (!email || shares.some((s) => s.email === email)) { setShareEmail(""); return; }
    setShares([...shares, { email, perm: "view" }]);
    setShareEmail("");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Calendar settings & sharing">
        <div className="space-y-4">
          <div><Label htmlFor="cn">Calendar name</Label><Input id="cn" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label htmlFor="cd">Description</Label><Input id="cd" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></div>
          <div>
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className={cn("h-7 w-7 rounded-full", color === c && "ring-2 ring-offset-2 ring-offset-surface")} style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px ${c}` : undefined }} aria-label={c}>
                  {color === c && <Check className="mx-auto h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Share2 className="h-4 w-4" /> Share with specific people</div>
            <ul className="mb-2 space-y-2">
              {shares.length === 0 && <li className="text-xs text-text-secondary">Not shared with anyone yet.</li>}
              {shares.map((s) => (
                <li key={s.email} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{s.email}</span>
                  <select value={s.perm} onChange={(e) => setShares(shares.map((x) => (x.email === s.email ? { ...x, perm: e.target.value as CalShare["perm"] } : x)))} className="h-8 rounded-md border border-border bg-surface px-2 text-xs">
                    <option value="view">See all the events</option>
                    <option value="edit">Make changes</option>
                  </select>
                  <button onClick={() => setShares(shares.filter((x) => x.email !== s.email))} className="text-text-secondary hover:text-danger" aria-label="Remove"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="person@yourdomain" onKeyDown={(e) => e.key === "Enter" && addShare()} />
              <Button variant="outline" onClick={addShare}>Add</Button>
            </div>
            <p className="mt-1 text-xs text-text-secondary">They must have a mailbox on this server; the calendar appears under “Shared with me”.</p>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { X, Plus, Calendar as CalIcon, CheckSquare, Square, Trash2, Video } from "lucide-react";
import { wmBookings, wmGetFullSettings, wmSaveSettings } from "./api";
import type { Meeting } from "./Calendar";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

interface Task { id: string; text: string; done: boolean }

/** Far-right Calendar / Tasks panel (Titan-style). Tasks persist in webmail prefs. */
export function CalendarTasks({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"calendar" | "tasks">("calendar");
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center border-b border-border">
        <button onClick={() => setTab("calendar")} className={cn("flex-1 px-4 py-3 text-sm font-medium", tab === "calendar" ? "border-b-2 border-primary text-primary" : "text-text-secondary")}>Calendar</button>
        <button onClick={() => setTab("tasks")} className={cn("flex-1 px-4 py-3 text-sm font-medium", tab === "tasks" ? "border-b-2 border-primary text-primary" : "text-text-secondary")}>Tasks</button>
        <button onClick={onClose} className="px-3 text-text-secondary hover:text-text-primary" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {tab === "calendar" ? <CalendarTab /> : <TasksTab />}
      </div>
    </aside>
  );
}

function CalendarTab() {
  const { data: bookings } = useQuery({ queryKey: ["wm", "bookings"], queryFn: wmBookings });
  const { data: settings } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const meetings = (((settings?.prefs ?? {}) as { meetings?: Meeting[] }).meetings) ?? [];

  type Ev = { id: string; title: string; when: Date; sub: string; kind: "meeting" | "booking" };
  const events: Ev[] = [
    ...meetings.map((m) => ({ id: m.id, title: m.title, when: new Date(m.startsAt), sub: "Meeting", kind: "meeting" as const })),
    ...(bookings ?? []).filter((b) => !b.cancelled).map((b) => ({ id: b.id, title: b.link.title, when: new Date(b.startsAt), sub: b.name, kind: "booking" as const })),
  ].filter((e) => e.when >= new Date(Date.now() - 86400000)).sort((a, b) => a.when.getTime() - b.when.getTime());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
        <Link to="/webmail/calendar" className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="h-3 w-3" /> Add / Manage</Link>
      </div>
      {events.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-text-secondary">
          <CalIcon className="mx-auto mb-2 h-6 w-6" />
          No upcoming events.
        </div>
      ) : (
        events.map((e) => (
          <div key={e.id} className="flex items-start gap-2 rounded-md border border-border p-3">
            <div className={e.kind === "meeting" ? "text-primary" : "text-secondary"}>{e.kind === "meeting" ? <Video className="h-4 w-4" /> : <CalIcon className="h-4 w-4" />}</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{e.title}</div>
              <div className="text-xs text-text-secondary">{e.sub} · {formatDate(e.when)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TasksTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const tasks = (((data?.prefs ?? {}) as { tasks?: Task[] }).tasks) ?? [];
  const [text, setText] = useState("");

  const save = useMutation({
    mutationFn: (next: Task[]) => wmSaveSettings({ prefs: { ...(data?.prefs ?? {}), tasks: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }),
  });

  const add = () => { if (!text.trim()) return; save.mutate([...tasks, { id: crypto.randomUUID(), text: text.trim(), done: false }]); setText(""); };
  const toggle = (id: string) => save.mutate(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id: string) => save.mutate(tasks.filter((t) => t.id !== id));

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add a task…" className="h-9 flex-1 rounded-md border border-border bg-surface px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <button onClick={add} className="rounded-md bg-primary px-2 text-white" aria-label="Add task"><Plus className="h-4 w-4" /></button>
      </div>
      {tasks.length === 0 && <p className="text-center text-sm text-text-secondary">No tasks yet.</p>}
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
          <button onClick={() => toggle(t.id)} aria-label="Toggle">{t.done ? <CheckSquare className="h-4 w-4 text-success" /> : <Square className="h-4 w-4 text-text-secondary" />}</button>
          <span className={cn("flex-1", t.done && "text-text-secondary line-through")}>{t.text}</span>
          <button onClick={() => remove(t.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-text-secondary hover:text-danger" /></button>
        </div>
      ))}
    </div>
  );
}

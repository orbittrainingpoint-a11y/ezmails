import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Calendar as CalIcon, Trash2, Circle, CheckCircle2, ListTodo, AlertTriangle, Sun, Clock, Inbox } from "lucide-react";
import { wmGetFullSettings, wmSaveSettings } from "./api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

export interface Task {
  id: string;
  title: string;
  notes?: string;
  due?: string | null; // YYYY-MM-DD (local) or null
  done: boolean;
  completedAt?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const prettyDue = (due: string) => {
  const t = todayStr();
  if (due === t) return "Today";
  const d = new Date(`${due}T00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

// Accept the old simple {text,done} task shape and upgrade it to {title,...}.
function normalize(raw: unknown[]): Task[] {
  return (raw as Record<string, unknown>[]).map((t) => ({
    id: String(t.id ?? crypto.randomUUID()),
    title: String(t.title ?? t.text ?? ""),
    notes: t.notes as string | undefined,
    due: (t.due as string | undefined) ?? null,
    done: Boolean(t.done),
    completedAt: t.completedAt as string | undefined,
  }));
}

type ListId = "all" | "overdue" | "today" | "later" | "nodate" | "completed";
const LISTS: { id: ListId; label: string; icon: typeof ListTodo }[] = [
  { id: "all", label: "All Tasks", icon: ListTodo },
  { id: "overdue", label: "Overdue", icon: AlertTriangle },
  { id: "today", label: "Today", icon: Sun },
  { id: "later", label: "Later", icon: Clock },
  { id: "nodate", label: "No Date", icon: Inbox },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
];

export function Tasks() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const prefs = (settings?.prefs ?? {}) as Record<string, unknown>;
  const tasks = useMemo(() => normalize((prefs.tasks as unknown[] | undefined) ?? []), [prefs.tasks]);

  const [list, setList] = useState<ListId>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const save = useMutation({
    mutationFn: (next: Task[]) => wmSaveSettings({ prefs: { ...prefs, tasks: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }),
  });
  const commit = (next: Task[]) => save.mutate(next);

  const t = todayStr();
  const match = (task: Task, id: ListId): boolean => {
    if (id === "completed") return task.done;
    if (task.done) return false;
    if (id === "all") return true;
    if (id === "overdue") return !!task.due && task.due < t;
    if (id === "today") return task.due === t;
    if (id === "later") return !!task.due && task.due > t;
    if (id === "nodate") return !task.due;
    return false;
  };
  const counts = (id: ListId) => tasks.filter((x) => match(x, id)).length;
  const visible = tasks
    .filter((x) => match(x, list))
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  const add = () => {
    const title = newTitle.trim();
    if (!title) return;
    const due = list === "today" ? t : null;
    commit([{ id: crypto.randomUUID(), title, due, done: false }, ...tasks]);
    setNewTitle("");
  };
  const update = (id: string, patch: Partial<Task>) => commit(tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const toggle = (task: Task) => update(task.id, { done: !task.done, completedAt: !task.done ? new Date().toISOString() : undefined });
  const remove = (id: string) => commit(tasks.filter((x) => x.id !== id));

  return (
    <div className="flex h-full">
      {/* Lists rail */}
      <aside className="w-full shrink-0 border-r border-border bg-surface p-3 sm:w-56">
        <Button className="mb-3 w-full" onClick={() => { setList("all"); setNewTitle(""); document.getElementById("task-new")?.focus(); }}>
          <Plus className="h-4 w-4" /> Add a task
        </Button>
        <nav className="space-y-0.5">
          {LISTS.map((l) => (
            <button
              key={l.id}
              onClick={() => setList(l.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm",
                list === l.id ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-elevated",
              )}
            >
              <span className="flex items-center gap-2"><l.icon className="h-4 w-4" /> {l.label}</span>
              {counts(l.id) > 0 && <span className="text-xs text-text-secondary">{counts(l.id)}</span>}
            </button>
          ))}
        </nav>
      </aside>

      {/* Task list */}
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
          <h1 className="mb-4 text-2xl font-semibold tracking-tight">{LISTS.find((l) => l.id === list)?.label}</h1>

          {list !== "completed" && (
            <div className="mb-4 flex gap-2">
              <Input id="task-new" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add a task…"
                onKeyDown={(e) => e.key === "Enter" && add()} />
              <Button onClick={add} disabled={!newTitle.trim()}><Plus className="h-4 w-4" /> Add</Button>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-12 text-center text-sm text-text-secondary">
              <ListTodo className="mx-auto mb-2 h-7 w-7" /> Nothing here.
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((task) => (
                <li key={task.id} className={cn("rounded-lg border border-border bg-surface", open === task.id && "ring-1 ring-primary")}>
                  <div className="flex items-start gap-3 p-3">
                    <button onClick={() => toggle(task)} className="mt-0.5 shrink-0" aria-label="Complete">
                      {task.done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-text-secondary hover:text-primary" />}
                    </button>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === task.id ? null : task.id)}>
                      <div className={cn("font-medium", task.done && "text-text-secondary line-through")}>{task.title}</div>
                      {task.notes && <div className="truncate text-sm text-text-secondary">{task.notes}</div>}
                      {task.due && (
                        <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                          !task.done && task.due < t ? "bg-danger/15 text-danger" : "bg-elevated text-text-secondary")}>
                          <CalIcon className="h-3 w-3" /> {prettyDue(task.due)}
                        </span>
                      )}
                    </button>
                    <button onClick={() => remove(task.id)} className="shrink-0 text-text-secondary hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>

                  {open === task.id && (
                    <div className="space-y-2 border-t border-border p-3">
                      <Input value={task.title} onChange={(e) => update(task.id, { title: e.target.value })} placeholder="Title" />
                      <textarea
                        value={task.notes ?? ""}
                        onChange={(e) => update(task.id, { notes: e.target.value })}
                        placeholder="Notes"
                        rows={2}
                        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant={task.due === t ? "primary" : "outline"} onClick={() => update(task.id, { due: t })}>Today</Button>
                        <Input type="date" value={task.due ?? ""} onChange={(e) => update(task.id, { due: e.target.value || null })} className="w-auto" />
                        {task.due && <Button size="sm" variant="ghost" onClick={() => update(task.id, { due: null })}>Clear date</Button>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

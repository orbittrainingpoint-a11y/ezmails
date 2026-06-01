import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Trash2, GripVertical, CalendarClock, Flag } from "lucide-react";
import { wmGetFullSettings, wmSaveSettings } from "./api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

type Priority = "low" | "med" | "high";
interface Card { id: string; title: string; notes?: string; due?: string; priority?: Priority }
interface Column { id: string; name: string; cards: Card[] }
type Board = Column[];

const uid = () => Math.random().toString(36).slice(2, 10);
const DEFAULT_BOARD: Board = [
  { id: uid(), name: "To Do", cards: [] },
  { id: uid(), name: "In Progress", cards: [] },
  { id: uid(), name: "Done", cards: [] },
];

const prioTone: Record<Priority, string> = {
  low: "text-text-secondary",
  med: "text-warning",
  high: "text-danger",
};

export function Planner() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const prefs = (settings?.prefs ?? {}) as Record<string, unknown>;
  const board: Board = (prefs.planner as Board | undefined) ?? DEFAULT_BOARD;

  const save = useMutation({
    mutationFn: (next: Board) => wmSaveSettings({ prefs: { ...prefs, planner: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }),
  });
  const commit = (next: Board) => save.mutate(next);

  const [editing, setEditing] = useState<{ colId: string; card: Card } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // ── mutations ──
  const addCard = (colId: string, title: string) =>
    commit(board.map((c) => (c.id === colId ? { ...c, cards: [...c.cards, { id: uid(), title }] } : c)));
  const patchCard = (colId: string, cardId: string, patch: Partial<Card>) =>
    commit(board.map((c) => (c.id === colId ? { ...c, cards: c.cards.map((k) => (k.id === cardId ? { ...k, ...patch } : k)) } : c)));
  const deleteCard = (colId: string, cardId: string) =>
    commit(board.map((c) => (c.id === colId ? { ...c, cards: c.cards.filter((k) => k.id !== cardId) } : c)));
  const moveCard = (cardId: string, toCol: string) => {
    let moved: Card | undefined;
    const stripped = board.map((c) => {
      const found = c.cards.find((k) => k.id === cardId);
      if (found) moved = found;
      return { ...c, cards: c.cards.filter((k) => k.id !== cardId) };
    });
    if (!moved) return;
    commit(stripped.map((c) => (c.id === toCol ? { ...c, cards: [...c.cards, moved!] } : c)));
  };
  const addColumn = () => commit([...board, { id: uid(), name: "New list", cards: [] }]);
  const renameColumn = (colId: string, name: string) => commit(board.map((c) => (c.id === colId ? { ...c, name } : c)));
  const deleteColumn = (colId: string) => commit(board.filter((c) => c.id !== colId));

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h1 className="text-lg font-semibold">Planner</h1>
        <Button size="sm" variant="outline" onClick={addColumn}><Plus className="h-4 w-4" /> Add list</Button>
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto p-5">
        {board.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId) { moveCard(dragId, col.id); setDragId(null); } }}
            className="flex max-h-full w-72 shrink-0 flex-col rounded-lg border border-border bg-surface"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                value={col.name}
                onChange={(e) => renameColumn(col.id, e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold focus:outline-none"
              />
              <span className="rounded bg-elevated px-1.5 text-xs text-text-secondary">{col.cards.length}</span>
              <button onClick={() => deleteColumn(col.id)} className="text-text-secondary hover:text-danger" title="Delete list"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 pb-2">
              {col.cards.map((card) => (
                <button
                  key={card.id}
                  draggable
                  onDragStart={() => setDragId(card.id)}
                  onClick={() => setEditing({ colId: col.id, card })}
                  className="group flex w-full items-start gap-2 rounded-md border border-border bg-base p-2.5 text-left hover:border-primary"
                >
                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-text-secondary opacity-0 group-hover:opacity-100" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{card.title}</div>
                    {(card.due || card.priority) && (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        {card.priority && <span className={cn("flex items-center gap-0.5", prioTone[card.priority])}><Flag className="h-3 w-3" />{card.priority}</span>}
                        {card.due && <span className="flex items-center gap-0.5 text-text-secondary"><CalendarClock className="h-3 w-3" />{card.due}</span>}
                      </div>
                    )}
                  </div>
                </button>
              ))}
              <AddCard onAdd={(t) => addCard(col.id, t)} />
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <CardEditor
          card={editing.card}
          onClose={() => setEditing(null)}
          onSave={(patch) => { patchCard(editing.colId, editing.card.id, patch); setEditing(null); }}
          onDelete={() => { deleteCard(editing.colId, editing.card.id); setEditing(null); }}
        />
      )}
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-secondary hover:bg-elevated">
      <Plus className="h-3.5 w-3.5" /> Add a card
    </button>
  );
  const submit = () => { if (val.trim()) onAdd(val.trim()); setVal(""); setOpen(false); };
  return (
    <div className="space-y-1">
      <textarea
        autoFocus value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") setOpen(false); }}
        placeholder="Card title…" rows={2}
        className="w-full rounded-md border border-border bg-base px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <div className="flex gap-1">
        <Button size="sm" onClick={submit}>Add</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function CardEditor({ card, onClose, onSave, onDelete }: {
  card: Card; onClose: () => void; onSave: (patch: Partial<Card>) => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes ?? "");
  const [due, setDue] = useState(card.due ?? "");
  const [priority, setPriority] = useState<Priority | "">(card.priority ?? "");
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Edit card</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={3}
            className="w-full rounded-md border border-border bg-base px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary">Due date</label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-text-secondary">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")}
                className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm">
                <option value="">None</option><option value="low">Low</option><option value="med">Medium</option><option value="high">High</option>
              </select>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger"><Trash2 className="h-4 w-4" /> Delete</Button>
          <Button size="sm" onClick={() => onSave({ title: title.trim() || card.title, notes: notes.trim() || undefined, due: due || undefined, priority: priority || undefined })}>Save</Button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StickyNote, Plus, Trash2, Pin, Check } from "lucide-react";
import { wmNotes, wmCreateNote, wmUpdateNote, wmDeleteNote, type Note } from "./api";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";

const COLORS = ["#FEF3C7", "#DBEAFE", "#FCE7F3", "#DCFCE7", "#EDE9FE"];

/** Sticky-notes sidebar for the currently open email. Many notes per message. */
export function NotesPanel({ messageId }: { messageId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["wm", "notes", messageId], queryFn: () => wmNotes(messageId) });
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["wm", "notes", messageId] });

  const create = useMutation({
    mutationFn: () => wmCreateNote({ messageId, body: draft, color }),
    onSuccess: () => { invalidate(); setDraft(""); },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <StickyNote className="h-4 w-4 text-secondary" />
        <span className="text-sm font-semibold">Notes</span>
        <span className="text-xs text-text-secondary">({data?.length ?? 0})</span>
      </div>

      <div className="border-b border-border p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Jot a note on this email…"
          rows={3}
          className="w-full rounded-md border border-border bg-surface p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={cn("h-5 w-5 rounded-full border", color === c && "ring-2 ring-primary")} style={{ background: c }} aria-label="Note color" />
            ))}
          </div>
          <Button size="sm" onClick={() => create.mutate()} loading={create.isPending} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-auto p-3">
        {data?.length === 0 && <p className="text-center text-xs text-text-secondary">No notes yet.</p>}
        {data?.map((n) => <NoteCard key={n.id} note={n} onChange={invalidate} />)}
      </div>
    </div>
  );
}

function NoteCard({ note, onChange }: { note: Note; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);

  const save = useMutation({ mutationFn: () => wmUpdateNote(note.id, { body }), onSuccess: () => { setEditing(false); onChange(); } });
  const pin = useMutation({ mutationFn: () => wmUpdateNote(note.id, { pinned: !note.pinned }), onSuccess: onChange });
  const remove = useMutation({ mutationFn: () => wmDeleteNote(note.id), onSuccess: onChange });

  return (
    <div className="rounded-md border border-border p-2 text-sm text-[#1a1a1a]" style={{ background: note.color ?? "#FEF3C7" }}>
      {editing ? (
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full rounded bg-white/60 p-1 text-sm" />
      ) : (
        <p className="whitespace-pre-wrap break-words">{note.body}</p>
      )}
      <div className="mt-1 flex items-center justify-between text-[11px] text-black/50">
        <span>{formatRelative(note.updatedAt)}</span>
        <div className="flex gap-1">
          <button onClick={() => pin.mutate()} aria-label="Pin"><Pin className={cn("h-3.5 w-3.5", note.pinned && "fill-black/60")} /></button>
          {editing ? (
            <button onClick={() => save.mutate()} aria-label="Save"><Check className="h-3.5 w-3.5" /></button>
          ) : (
            <button onClick={() => setEditing(true)} aria-label="Edit" className="underline">edit</button>
          )}
          <button onClick={() => remove.mutate()} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

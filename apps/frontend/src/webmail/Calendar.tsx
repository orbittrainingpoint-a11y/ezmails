import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, CalendarDays, Clock, Trash2, Video, ExternalLink } from "lucide-react";
import { wmGetFullSettings, wmSaveSettings, wmBookings } from "./api";
import { Bookings } from "./Bookings";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface Meeting { id: string; title: string; startsAt: string; endsAt: string; notes?: string; link?: string }

const linkHref = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function Calendar() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
      <Tabs defaultValue="agenda">
        <TabsList>
          <TabsTrigger value="agenda">My Calendar</TabsTrigger>
          <TabsTrigger value="links">Booking Links</TabsTrigger>
        </TabsList>
        <TabsContent value="agenda"><Agenda /></TabsContent>
        <TabsContent value="links"><div className="-mt-2"><Bookings /></div></TabsContent>
      </Tabs>
    </div>
  );
}

function Agenda() {
  const { data: settings } = useQuery({ queryKey: ["wm", "fullsettings"], queryFn: wmGetFullSettings });
  const { data: bookings } = useQuery({ queryKey: ["wm", "bookings"], queryFn: wmBookings });
  const qc = useQueryClient();
  const prefs = (settings?.prefs ?? {}) as Record<string, unknown>;
  const meetings = (prefs.meetings as Meeting[] | undefined) ?? [];

  const [editing, setEditing] = useState<Meeting | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const removeMeeting = useMutation({
    mutationFn: (id: string) => wmSaveSettings({ prefs: { ...prefs, meetings: meetings.filter((m) => m.id !== id) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }); toast.success("Meeting removed."); },
  });

  type Ev = { id: string; title: string; when: Date; sub: string; kind: "meeting" | "booking"; meeting?: Meeting; link?: string };
  const events: Ev[] = [
    ...meetings.map((m) => ({ id: m.id, title: m.title, when: new Date(m.startsAt), sub: m.notes || "Meeting", kind: "meeting" as const, meeting: m, link: m.link })),
    ...(bookings ?? []).filter((b) => !b.cancelled).map((b) => ({ id: b.id, title: b.link.title, when: new Date(b.startsAt), sub: `${b.name} · booking`, kind: "booking" as const })),
  ]
    .filter((e) => e.when >= new Date(Date.now() - 86400000))
    .sort((a, b) => a.when.getTime() - b.when.getTime());

  const groups = events.reduce<Record<string, Ev[]>>((acc, e) => {
    const k = e.when.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    (acc[k] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">Your meetings and confirmed bookings. Click a meeting to edit it.</p>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4" /> Add meeting</Button>
      </div>

      {events.length === 0 ? (
        <Card><CardContent>
          <div className="py-10 text-center text-sm text-text-secondary"><CalendarDays className="mx-auto mb-2 h-7 w-7" />No upcoming events. Add a meeting to get started.</div>
        </CardContent></Card>
      ) : (
        Object.entries(groups).map(([day, evs]) => (
          <div key={day}>
            <div className="mb-1 text-sm font-semibold text-text-secondary">{day}</div>
            <div className="space-y-2">
              {evs.map((e) => (
                <div
                  key={e.id}
                  onClick={() => e.meeting && (setEditing(e.meeting), setDialogOpen(true))}
                  className={cn("flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3", e.meeting && "cursor-pointer hover:border-primary")}
                >
                  <div className={e.kind === "meeting" ? "text-primary" : "text-secondary"}>{e.kind === "meeting" ? <Video className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs text-text-secondary"><Clock className="mr-1 inline h-3 w-3" />{formatDate(e.when)} · {e.sub}</div>
                    {e.link && (
                      <a
                        href={linkHref(e.link)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(ev) => ev.stopPropagation()}
                        className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" /> {e.link}
                      </a>
                    )}
                  </div>
                  {e.link && (
                    <a href={linkHref(e.link)} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>
                      <Button variant="outline" size="sm"><Video className="h-4 w-4" /> Join</Button>
                    </a>
                  )}
                  {e.kind === "meeting" && (
                    <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); removeMeeting.mutate(e.id); }} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <MeetingDialog prefs={prefs} meetings={meetings} editing={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function MeetingDialog({ prefs, meetings, editing, open, onOpenChange }: {
  prefs: Record<string, unknown>; meetings: Meeting[]; editing: Meeting | null; open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("09:30");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const s = new Date(editing.startsAt), e = new Date(editing.endsAt);
      setTitle(editing.title); setDate(localDate(s)); setStart(localTime(s)); setEnd(localTime(e));
      setNotes(editing.notes ?? ""); setLink(editing.link ?? "");
    } else {
      setTitle(""); setDate(""); setStart("09:00"); setEnd("09:30"); setNotes(""); setLink("");
    }
  }, [open, editing]);

  const save = useMutation({
    mutationFn: () => {
      const startsAt = new Date(`${date}T${start}`).toISOString();
      const endsAt = new Date(`${date}T${end}`).toISOString();
      const m: Meeting = { id: editing?.id ?? crypto.randomUUID(), title, startsAt, endsAt, notes: notes || undefined, link: link || undefined };
      const next = editing ? meetings.map((x) => (x.id === editing.id ? m : x)) : [...meetings, m];
      return wmSaveSettings({ prefs: { ...prefs, meetings: next } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "fullsettings"] }); toast.success(editing ? "Meeting updated." : "Meeting added."); onOpenChange(false); },
    onError: () => toast.error("Could not save meeting."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Edit meeting" : "Add meeting"}>
        <div className="space-y-3">
          <div><Label htmlFor="mt">Title</Label><Input id="mt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project sync" autoFocus /></div>
          <div><Label htmlFor="md">Date</Label><Input id="md" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="ms">Start</Label><Input id="ms" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label htmlFor="me">End</Label><Input id="me" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div><Label htmlFor="ml">Meeting link (optional)</Label><Input id="ml" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet…" /></div>
          <div><Label htmlFor="mn">Notes</Label><Input id="mn" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!title.trim() || !date}>{editing ? "Save" : "Add"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Link2, Calendar, X } from "lucide-react";
import {
  wmBookingLinks,
  wmCreateBookingLink,
  wmDeleteBookingLink,
  wmBookings,
  wmCancelBooking,
  type Availability,
  type BookingLink,
} from "./api";
import { WmError } from "./api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/Dialog";
import { CopyButton } from "@/components/ui/CopyButton";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";

const DAYS = [
  ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
] as const;

export function Bookings() {
  const links = useQuery({ queryKey: ["wm", "booking-links"], queryFn: wmBookingLinks });
  const bookings = useQuery({ queryKey: ["wm", "bookings"], queryFn: wmBookings });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Titan Bookings</h1>
          <p className="text-sm text-text-secondary">Share a link; invitees pick a slot that syncs to your calendar.</p>
        </div>
        <NewLinkDialog />
      </div>

      <Card>
        <CardHeader><CardTitle>Booking links</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {links.data?.length === 0 && <p className="text-sm text-text-secondary">No links yet.</p>}
          {links.data?.map((l) => <LinkRow key={l.id} link={l} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Upcoming bookings</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {bookings.data?.filter((b) => !b.cancelled).length === 0 && <p className="text-sm text-text-secondary">No bookings yet.</p>}
          {bookings.data?.filter((b) => !b.cancelled).map((b) => <BookingRowView key={b.id} booking={b} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function LinkRow({ link }: { link: BookingLink }) {
  const qc = useQueryClient();
  const url = `${window.location.origin}/book/${link.slug}`;
  const remove = useMutation({ mutationFn: () => wmDeleteBookingLink(link.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "booking-links"] }); toast.success("Link deleted."); } });
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
      <div className="min-w-0">
        <div className="font-medium">{link.title} <Badge tone="neutral">{link.durationMins}m</Badge></div>
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <Link2 className="h-3 w-3" /> <span className="truncate">{url}</span> <CopyButton value={url} />
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={() => remove.mutate()} aria-label="Delete link"><Trash2 className="h-4 w-4 text-danger" /></Button>
    </div>
  );
}

function BookingRowView({ booking }: { booking: { id: string; name: string; email: string; startsAt: string; link: { title: string } } }) {
  const qc = useQueryClient();
  const cancel = useMutation({ mutationFn: () => wmCancelBooking(booking.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "bookings"] }); toast.success("Booking cancelled."); } });
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <Calendar className="h-4 w-4 text-text-secondary" />
        <div>
          <div className="font-medium">{booking.name} · {booking.link.title}</div>
          <div className="text-xs text-text-secondary">{booking.email} · {formatDate(booking.startsAt)}</div>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={() => cancel.mutate()} aria-label="Cancel"><X className="h-4 w-4 text-danger" /></Button>
    </div>
  );
}

function NewLinkDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [days, setDays] = useState<Record<string, { on: boolean; from: string; to: string }>>(
    Object.fromEntries(DAYS.map(([k]) => [k, { on: k !== "sat" && k !== "sun", from: "09:00", to: "17:00" }])),
  );

  const create = useMutation({
    mutationFn: () => {
      const availability: Availability = {};
      for (const [k] of DAYS) if (days[k]!.on) availability[k] = [[days[k]!.from, days[k]!.to]];
      return wmCreateBookingLink({ title, description: description || undefined, durationMins: duration, availability });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "booking-links"] }); toast.success("Booking link created."); setOpen(false); setTitle(""); },
    onError: (e) => toast.error(e instanceof WmError ? e.message : "Failed."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> New link</Button></DialogTrigger>
      <DialogContent title="New booking link" className="max-w-lg">
        <div className="space-y-3">
          <div><Label htmlFor="bt">Title</Label><Input id="bt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="30-minute meeting" /></div>
          <div><Label htmlFor="bd">Description</Label><Input id="bd" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><Label htmlFor="bdur">Duration (minutes)</Label><Input id="bdur" type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
          <div>
            <Label>Weekly availability (UTC)</Label>
            <div className="space-y-1">
              {DAYS.map(([k, label]) => (
                <div key={k} className="flex items-center gap-2">
                  <label className="flex w-16 items-center gap-1 text-sm">
                    <input type="checkbox" className="accent-primary" checked={days[k]!.on} onChange={(e) => setDays((d) => ({ ...d, [k]: { ...d[k]!, on: e.target.checked } }))} /> {label}
                  </label>
                  <Input type="time" className="h-8 w-28" value={days[k]!.from} disabled={!days[k]!.on} onChange={(e) => setDays((d) => ({ ...d, [k]: { ...d[k]!, from: e.target.value } }))} />
                  <span className="text-text-secondary">–</span>
                  <Input type="time" className="h-8 w-28" value={days[k]!.to} disabled={!days[k]!.on} onChange={(e) => setDays((d) => ({ ...d, [k]: { ...d[k]!, to: e.target.value } }))} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!title.trim()}>Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

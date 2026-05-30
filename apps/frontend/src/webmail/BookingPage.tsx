import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Mail, Calendar, Check, Download } from "lucide-react";
import { publicBooking, publicBook, bookingIcsUrl, WmError } from "./api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Spinner } from "@/components/ui/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";

export function BookingPage() {
  const { slug = "" } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ["public-booking", slug], queryFn: () => publicBooking(slug) });
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [bookedId, setBookedId] = useState<string | null>(null);

  const book = useMutation({
    mutationFn: () => publicBook(slug, { name, email, startsAt: slot, notes: notes || undefined }),
    onSuccess: (b) => setBookedId(b.id),
  });

  // Group slots by date.
  const byDay = (data?.slots ?? []).reduce<Record<string, string[]>>((acc, iso) => {
    const day = new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    (acc[day] ??= []).push(iso);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-base">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-secondary"><Mail className="h-5 w-5 text-white" /></div>
          <span className="font-semibold">ezmails</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {isLoading ? (
          <Spinner />
        ) : error || !data ? (
          <p className="text-center text-sm text-text-secondary">This booking link is unavailable.</p>
        ) : bookedId ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/15"><Check className="h-6 w-6 text-success" /></div>
            <h1 className="text-xl font-semibold">You're booked!</h1>
            <p className="mt-1 text-sm text-text-secondary">A confirmation for {data.title} on {new Date(slot!).toLocaleString()}.</p>
            <a href={bookingIcsUrl(bookedId)} className="mt-4 inline-flex"><Button variant="outline"><Download className="h-4 w-4" /> Add to calendar (.ics)</Button></a>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">{data.title}</h1>
                <p className="text-sm text-text-secondary">{data.durationMins} minutes · {data.timezone}</p>
              </div>
            </div>
            {data.description && <p className="mb-4 text-sm text-text-secondary">{data.description}</p>}

            {!slot ? (
              <div className="space-y-4">
                {Object.keys(byDay).length === 0 && <p className="text-sm text-text-secondary">No open slots in the next two weeks.</p>}
                {Object.entries(byDay).map(([day, slots]) => (
                  <div key={day}>
                    <div className="mb-1 text-sm font-medium">{day}</div>
                    <div className="flex flex-wrap gap-2">
                      {slots.map((iso) => (
                        <button key={iso} onClick={() => setSlot(iso)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary">
                          {new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm">Selected: <strong>{new Date(slot).toLocaleString()}</strong> <button onClick={() => setSlot(null)} className="text-primary hover:underline">change</button></p>
                <div><Label htmlFor="n">Your name</Label><Input id="n" value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label htmlFor="e">Your email</Label><Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label htmlFor="nt">Notes</Label><Input id="nt" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                {book.error && <p className="text-sm text-danger">{book.error instanceof WmError ? book.error.message : "Could not book."}</p>}
                <Button onClick={() => book.mutate()} loading={book.isPending} disabled={!name.trim() || !email.trim()} className="w-full">Confirm booking</Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

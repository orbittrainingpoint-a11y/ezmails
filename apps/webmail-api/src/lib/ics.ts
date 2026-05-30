/** Build a minimal RFC 5545 VEVENT so bookings can be added to any calendar. */
export function buildIcs(event: {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  organizerEmail: string;
  attendeeEmail: string;
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ezmails//Titan Bookings//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(event.start)}`,
    `DTEND:${fmt(event.end)}`,
    `SUMMARY:${event.summary}`,
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, "\\n")}` : "",
    `ORGANIZER:mailto:${event.organizerEmail}`,
    `ATTENDEE;RSVP=TRUE:mailto:${event.attendeeEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

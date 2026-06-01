import { prisma } from "@ezmails/db";

export async function listContacts(mailboxId: string) {
  return prisma.webmailContact.findMany({ where: { mailboxId }, orderBy: [{ useCount: "desc" }, { name: "asc" }] });
}

export async function createContact(mailboxId: string, body: { name: string; emails: string[]; phone?: string; notes?: string; labels?: string[] }) {
  return prisma.webmailContact.create({
    data: { mailboxId, name: body.name, emails: body.emails, phone: body.phone, notes: body.notes, labels: body.labels },
  });
}

export async function updateContact(mailboxId: string, id: string, body: Record<string, unknown>) {
  const existing = await prisma.webmailContact.findFirst({ where: { id, mailboxId } });
  if (!existing) return null;
  return prisma.webmailContact.update({ where: { id }, data: body });
}

export async function deleteContact(mailboxId: string, id: string) {
  await prisma.webmailContact.deleteMany({ where: { id, mailboxId } });
}

/**
 * After sending, save/boost each recipient so it appears in compose autocomplete
 * next time (WM-029). Creates a contact for new addresses, bumps useCount for known ones.
 */
export async function recordUse(mailboxId: string, emails: string[]) {
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email.includes("@")) continue;
    const existing = await prisma.webmailContact
      .findFirst({ where: { mailboxId, emails: { array_contains: email } } })
      .catch(() => null);
    if (existing) {
      await prisma.webmailContact.update({ where: { id: existing.id }, data: { useCount: { increment: 1 } } }).catch(() => {});
    } else {
      await prisma.webmailContact
        .create({ data: { mailboxId, name: email.split("@")[0] || email, emails: [email], useCount: 1 } })
        .catch(() => {});
    }
  }
}

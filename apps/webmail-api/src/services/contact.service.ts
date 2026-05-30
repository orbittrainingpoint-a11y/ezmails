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

/** Bump a contact's use counter for compose autocomplete ranking (WM-029). */
export async function recordUse(mailboxId: string, emails: string[]) {
  if (!emails.length) return;
  await prisma.webmailContact.updateMany({
    where: { mailboxId, emails: { array_contains: emails } },
    data: { useCount: { increment: 1 } },
  }).catch(() => {});
}

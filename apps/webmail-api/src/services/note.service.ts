import { prisma } from "@ezmails/db";
import { AppError } from "../lib/errors.js";

/** Notes attached to a specific email (keyed by RFC Message-ID). Many per email. */
export async function listNotes(mailboxId: string, messageId: string) {
  return prisma.webmailNote.findMany({
    where: { mailboxId, messageId },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
}

export async function createNote(mailboxId: string, body: { messageId: string; title?: string; body: string; color?: string }) {
  return prisma.webmailNote.create({
    data: { mailboxId, messageId: body.messageId, title: body.title, body: body.body, color: body.color },
  });
}

export async function updateNote(mailboxId: string, id: string, body: Record<string, unknown>) {
  const existing = await prisma.webmailNote.findFirst({ where: { id, mailboxId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Note not found.");
  return prisma.webmailNote.update({ where: { id }, data: body });
}

export async function deleteNote(mailboxId: string, id: string) {
  await prisma.webmailNote.deleteMany({ where: { id, mailboxId } });
}

/** Count notes per message for an inbox badge (optional helper). */
export async function countNotes(mailboxId: string, messageIds: string[]) {
  if (messageIds.length === 0) return {};
  const rows = await prisma.webmailNote.groupBy({
    by: ["messageId"],
    where: { mailboxId, messageId: { in: messageIds } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.messageId, r._count._all]));
}

import { prisma } from "@ezmails/db";

export async function getSettings(mailboxId: string) {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
  return (
    s ?? {
      mailboxId,
      signatureHtml: null,
      vacationEnabled: false,
      vacationStart: null,
      vacationEnd: null,
      vacationSubject: null,
      vacationMessage: null,
      prefs: null,
    }
  );
}

export async function saveSettings(mailboxId: string, body: Record<string, unknown>) {
  return prisma.webmailSettings.upsert({
    where: { mailboxId },
    create: { mailboxId, ...body },
    update: body,
  });
}

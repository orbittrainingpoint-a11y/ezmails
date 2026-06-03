import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors } from "../lib/errors.js";
import {
  listFolders,
  folderCounts,
  createFolder,
  deleteFolder,
  renameFolder,
  emptyFolder,
  listMessages,
  getMessage,
  getAttachment,
  setFlags,
  moveMessage,
  trashMessage,
  send,
  saveDraft,
  exportMbox,
} from "../services/mail.service.js";
import { PassThrough } from "node:stream";
import { recordUse } from "../services/contact.service.js";
import { schedule, listScheduled, cancel, flushDue } from "../services/scheduled.service.js";
import { maybeAutoClean } from "../services/autoclean.service.js";
import { maybeApplyRules } from "../services/rule.service.js";

const sendSchema = z.object({
  from: z.string().email().optional(), // send-as: primary address or an alias the mailbox owns
  track: z.boolean().optional(), // embed a read-tracking pixel
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().default(""),
  html: z.string().optional(),
  text: z.string().optional(),
  attachments: z
    .array(z.object({ filename: z.string(), contentBase64: z.string(), contentType: z.string().optional() }))
    .optional(),
  scheduledAt: z.string().datetime().optional(), // ISO; if in the future, queue instead of sending now
});

export default async function mailRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/folders", async (req, reply) => {
    await flushDue(req.creds!).catch(() => {}); // deliver any due scheduled mail on inbox open
    void maybeApplyRules(req.creds!, req.creds!.mailboxId).catch(() => {}); // throttled: filters + blocked senders
    void maybeAutoClean(req.creds!, req.creds!.mailboxId).catch(() => {}); // throttled, fire-and-forget
    return reply.send({ success: true, data: await listFolders(req.creds!) });
  });

  app.get("/folders/counts", async (req, reply) => reply.send({ success: true, data: await folderCounts(req.creds!) }));

  // Scheduled (send later) queue.
  app.get("/scheduled", async (req, reply) => reply.send({ success: true, data: await listScheduled(req.creds!) }));
  app.delete("/scheduled/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await cancel(req.creds!, id) });
  });

  app.post("/folders", async (req, reply) => {
    const { path } = z.object({ path: z.string().min(1) }).parse(req.body);
    return reply.send({ success: true, data: await createFolder(req.creds!, path) });
  });

  app.post("/folders/delete", async (req, reply) => {
    const { path } = z.object({ path: z.string().min(1) }).parse(req.body);
    return reply.send({ success: true, data: await deleteFolder(req.creds!, path) });
  });

  app.post("/folders/rename", async (req, reply) => {
    const { path, newPath } = z.object({ path: z.string().min(1), newPath: z.string().min(1) }).parse(req.body);
    return reply.send({ success: true, data: await renameFolder(req.creds!, path, newPath) });
  });

  app.post("/folders/empty", async (req, reply) => {
    const { path } = z.object({ path: z.string().min(1) }).parse(req.body);
    return reply.send({ success: true, data: await emptyFolder(req.creds!, path) });
  });

  app.get("/messages", async (req, reply) => {
    const q = z
      .object({ folder: z.string().default("INBOX"), page: z.coerce.number().default(1), pageSize: z.coerce.number().max(100).default(50), search: z.string().optional() })
      .parse(req.query);
    return reply.send({ success: true, data: await listMessages(req.creds!, q) });
  });

  app.get("/messages/:uid", async (req, reply) => {
    const { uid } = req.params as { uid: string };
    const { folder, markSeen } = z.object({ folder: z.string().default("INBOX"), markSeen: z.coerce.boolean().default(true) }).parse(req.query);
    const msg = await getMessage(req.creds!, folder, Number(uid), markSeen);
    if (!msg) throw Errors.notFound("Message not found.");
    return reply.send({ success: true, data: msg });
  });

  app.get("/messages/:uid/attachments/:index", async (req, reply) => {
    const { uid, index } = req.params as { uid: string; index: string };
    const { folder, download } = z
      .object({ folder: z.string().default("INBOX"), download: z.coerce.boolean().default(false) })
      .parse(req.query);
    const att = await getAttachment(req.creds!, folder, Number(uid), Number(index));
    if (!att) throw Errors.notFound("Attachment not found.");
    // Inline by default so PDFs/images render in the previewer; ?download=1 forces a download.
    const disp = download ? "attachment" : "inline";
    return reply
      .header("content-type", att.contentType || "application/octet-stream")
      .header("content-disposition", `${disp}; filename="${att.filename.replace(/"/g, "")}"`)
      .header("x-content-type-options", "nosniff")
      .send(att.content);
  });

  app.post("/messages", async (req, reply) => {
    const body = sendSchema.parse(req.body);

    // Schedule for later if a future time was given.
    if (body.scheduledAt && new Date(body.scheduledAt).getTime() > Date.now() + 5_000) {
      const { scheduledAt, ...msg } = body;
      const entry = await schedule(req.creds!, msg, new Date(scheduledAt));
      await recordUse(req.creds!.mailboxId, body.to);
      return reply.send({ success: true, data: { scheduled: true, id: entry.id, scheduledAt: entry.scheduledAt } });
    }

    const attachments = body.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, "base64"),
      contentType: a.contentType,
    }));
    const result = await send(req.creds!, { ...body, attachments });
    await recordUse(req.creds!.mailboxId, body.to);
    return reply.send({ success: true, data: result });
  });

  // Full mailbox export as a downloadable .mbox file.
  app.get("/backup/export", async (req, reply) => {
    const stream = new PassThrough();
    const stamp = new Date().toISOString().slice(0, 10);
    reply
      .header("content-type", "application/mbox")
      .header("content-disposition", `attachment; filename="ezmail-backup-${stamp}.mbox"`)
      .header("cache-control", "no-store");
    // Run the export in the background, piping into the response as it goes.
    exportMbox(req.creds!, stream).catch(() => stream.destroy());
    return reply.send(stream);
  });

  app.post("/messages/draft", async (req, reply) => {
    // Lenient: a draft may have no/partial recipients and no subject.
    const body = z
      .object({
        to: z.array(z.string()).optional(),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
        subject: z.string().optional(),
        html: z.string().optional(),
        text: z.string().optional(),
        attachments: z.array(z.object({ filename: z.string(), contentBase64: z.string(), contentType: z.string().optional() })).optional(),
      })
      .parse(req.body);
    const attachments = body.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.contentBase64, "base64"), contentType: a.contentType }));
    return reply.send({ success: true, data: await saveDraft(req.creds!, { ...body, attachments }) });
  });

  app.patch("/messages/:uid", async (req, reply) => {
    const { uid } = req.params as { uid: string };
    const { folder, seen, flagged } = z
      .object({ folder: z.string().default("INBOX"), seen: z.boolean().optional(), flagged: z.boolean().optional() })
      .parse(req.body);
    return reply.send({ success: true, data: await setFlags(req.creds!, folder, Number(uid), { seen, flagged }) });
  });

  app.post("/messages/:uid/move", async (req, reply) => {
    const { uid } = req.params as { uid: string };
    const { folder, target } = z.object({ folder: z.string(), target: z.string() }).parse(req.body);
    return reply.send({ success: true, data: await moveMessage(req.creds!, folder, Number(uid), target) });
  });

  app.delete("/messages/:uid", async (req, reply) => {
    const { uid } = req.params as { uid: string };
    const { folder } = z.object({ folder: z.string().default("INBOX") }).parse(req.query);
    return reply.send({ success: true, data: await trashMessage(req.creds!, folder, Number(uid)) });
  });
}

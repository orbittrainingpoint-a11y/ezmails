import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors } from "../lib/errors.js";
import { parseCsvWithHeader } from "../lib/csv.js";
import { listContacts, createContact, updateContact, deleteContact } from "../services/contact.service.js";

const contactSchema = z.object({
  name: z.string().min(1),
  emails: z.array(z.string().email()).min(1),
  phone: z.string().optional(),
  notes: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

export default async function contactRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/contacts", async (req, reply) => reply.send({ success: true, data: await listContacts(req.creds!.mailboxId) }));

  app.post("/contacts", async (req, reply) => {
    const body = contactSchema.parse(req.body);
    return reply.send({ success: true, data: await createContact(req.creds!.mailboxId, body) });
  });

  app.patch("/contacts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = await updateContact(req.creds!.mailboxId, id, contactSchema.partial().parse(req.body));
    if (!updated) throw Errors.notFound("Contact not found.");
    return reply.send({ success: true, data: updated });
  });

  app.delete("/contacts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteContact(req.creds!.mailboxId, id);
    return reply.send({ success: true });
  });

  // Import contacts from CSV (columns: name, email).
  app.post("/contacts/import", async (req, reply) => {
    const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);
    const rows = parseCsvWithHeader(csv);
    let imported = 0;
    for (const r of rows) {
      const email = (r["email"] ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
      await createContact(req.creds!.mailboxId, { name: r["name"] || email, emails: [email] }).catch(() => {});
      imported++;
    }
    return reply.send({ success: true, data: { imported, total: rows.length } });
  });
}

// Demo data for local testing. Run: npm run seed:demo -w @ezmails/db
// Idempotent-ish: upserts users/domain/mailboxes; mail logs seeded once.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole, MailLogStatus } from "@prisma/client";

const prisma = new PrismaClient();
const COST = 10;
const appPass = (p: string) => bcrypt.hashSync(p, COST);
const mailboxPass = (p: string) => `{BLF-CRYPT}${bcrypt.hashSync(p, COST)}`;
const tok = () => randomBytes(16).toString("hex");

async function main() {
  console.log("Seeding demo data…");

  // ── Users ──
  const admin = await prisma.user.upsert({
    where: { email: "admin@ezmails.local" },
    update: {},
    create: { email: "admin@ezmails.local", displayName: "Demo Admin", passwordHash: appPass("Admin@12345"), role: UserRole.super_admin },
  });

  const reseller = await prisma.user.upsert({
    where: { email: "reseller@ezmails.local" },
    update: {},
    create: { email: "reseller@ezmails.local", displayName: "Acme Reseller", passwordHash: appPass("Reseller@123"), role: UserRole.reseller, maxCustomers: 20, maxDomains: 50, storagePool: BigInt(50) * 1024n * 1024n * 1024n },
  });

  const customer = await prisma.user.upsert({
    where: { email: "customer@ezmails.local" },
    update: {},
    create: { email: "customer@ezmails.local", displayName: "Globex Inc", passwordHash: appPass("Customer@123"), role: UserRole.customer, parentId: reseller.id },
  });

  // ── Node ──
  await prisma.node.upsert({
    where: { hostname: "localhost" },
    update: {},
    create: { name: "primary", hostname: "localhost", ipAddress: "127.0.0.1", status: "online" },
  });

  // ── Domain ──
  const domain = await prisma.domain.upsert({
    where: { domainName: "demo.local" },
    update: {},
    create: {
      domainName: "demo.local",
      ownerId: customer.id,
      maxMailboxes: 50,
      storageQuota: BigInt(10) * 1024n * 1024n * 1024n,
      sendRate: 500,
    },
  });

  // A couple of DNS records so the DNS tab shows content.
  const dnsCount = await prisma.dnsRecord.count({ where: { domainId: domain.id } });
  if (dnsCount === 0) {
    await prisma.dnsRecord.createMany({
      data: [
        { domainId: domain.id, recordType: "MX", hostname: "demo.local", expectedValue: "10 mail.localhost", status: "valid" },
        { domainId: domain.id, recordType: "SPF", hostname: "demo.local", expectedValue: "v=spf1 a:mail.localhost mx ~all", status: "valid" },
        { domainId: domain.id, recordType: "DMARC", hostname: "_dmarc.demo.local", expectedValue: "v=DMARC1; p=quarantine; rua=mailto:dmarc@demo.local", status: "missing" },
      ],
    });
  }

  // ── Mailboxes (webmail demo users) ──
  const mailboxes = [
    { local: "john", name: "John Doe" },
    { local: "jane", name: "Jane Smith" },
  ];
  let firstMailboxId = "";
  const mailboxIds: Record<string, string> = {};
  for (const m of mailboxes) {
    const email = `${m.local}@demo.local`;
    const box = await prisma.mailbox.upsert({
      where: { email },
      update: {},
      create: {
        domainId: domain.id,
        email,
        localPart: m.local,
        displayName: m.name,
        password: mailboxPass("Demo@12345"),
        quota: BigInt(1) * 1024n * 1024n * 1024n,
        maildir: `demo.local/${m.local}/`,
      },
    });
    if (!firstMailboxId) firstMailboxId = box.id;
    mailboxIds[m.local] = box.id;
  }

  // ── Demo emails into the dev mail store (so the webmail inbox has content) ──
  for (const local of ["john", "jane"]) {
    const mbId = mailboxIds[local]!;
    if ((await prisma.devMail.count({ where: { mailboxId: mbId } })) > 0) continue;
    const inbox = [
      { fromName: "Acme Billing", fromAddr: "billing@acme.com", subject: "Your invoice for May", html: "<p>Hi,</p><p>Your May invoice is attached. Thank you for your business.</p>", days: 1, seen: false },
      { fromName: "Globex Team", fromAddr: "team@globex.com", subject: "Project kickoff next week", html: "<p>Hello,</p><p>Let's schedule the project kickoff for next Tuesday. Does 10am work?</p>", days: 2, seen: false },
      { fromName: "ezmails", fromAddr: "welcome@ezmails.local", subject: "Welcome to ezmails 🎉", html: "<p>Welcome aboard! Your new mailbox is ready. Explore Campaigns, Calendar, Rules and AI Smart Write.</p>", days: 3, seen: true },
      { fromName: "Newsletter", fromAddr: "news@updates.example", subject: "5 productivity tips", html: "<p>This week: batching email, calendar blocking, and more.</p>", days: 4, seen: true },
    ];
    let uid = 1;
    for (const e of inbox) {
      await prisma.devMail.create({
        data: {
          mailboxId: mbId, folder: "INBOX", uid: uid++, messageId: `<${tok()}@ezmails.local>`,
          fromName: e.fromName, fromAddr: e.fromAddr, toJson: [{ address: `${local}@demo.local` }],
          subject: e.subject, html: e.html, seen: e.seen, createdAt: new Date(Date.now() - e.days * 86400000),
        },
      });
    }
  }

  // Alias + forwarder
  await prisma.alias.upsert({
    where: { id: (await prisma.alias.findFirst({ where: { domainId: domain.id, source: "sales@demo.local" } }))?.id ?? "00000000-0000-0000-0000-000000000000" },
    update: {},
    create: { domainId: domain.id, source: "sales@demo.local", destination: "john@demo.local,jane@demo.local" },
  }).catch(() => {});

  // ── Mail log (for dashboard charts) ──
  if ((await prisma.mailLog.count()) === 0) {
    const statuses: MailLogStatus[] = ["delivered", "delivered", "delivered", "delivered", "bounced", "rejected", "deferred"];
    const rows = [] as { queueId: string; sender: string; recipient: string; status: MailLogStatus; sizeBytes: number; createdAt: Date; spamScore: number }[];
    for (let i = 0; i < 120; i++) {
      const daysAgo = Math.floor(Math.random() * 7);
      const d = new Date(Date.now() - daysAgo * 86400000 - Math.random() * 86400000);
      rows.push({
        queueId: tok().slice(0, 12).toUpperCase(),
        sender: ["john@demo.local", "jane@demo.local", "noreply@news.example", "billing@vendor.io"][i % 4]!,
        recipient: ["jane@demo.local", "client@globex.com", "john@demo.local", "team@acme.org"][i % 4]!,
        status: statuses[i % statuses.length]!,
        sizeBytes: 1024 + Math.floor(Math.random() * 80000),
        spamScore: Math.round(Math.random() * 14 * 10) / 10,
        createdAt: d,
      });
    }
    await prisma.mailLog.createMany({ data: rows });
  }

  // ── Titan demo: a campaign + a booking link for John ──
  if (firstMailboxId && (await prisma.campaign.count({ where: { mailboxId: firstMailboxId } })) === 0) {
    const campaign = await prisma.campaign.create({
      data: { mailboxId: firstMailboxId, name: "Spring Newsletter", subject: "Hello {{name}}, news from us!", bodyHtml: "<p>Hi {{name}},</p><p>Thanks for being with us.</p>", status: "draft" },
    });
    await prisma.campaignRecipient.createMany({
      data: [
        { campaignId: campaign.id, email: "client@globex.com", name: "Globex", openToken: tok(), status: "pending" },
        { campaignId: campaign.id, email: "team@acme.org", name: "Acme", openToken: tok(), status: "pending" },
      ],
    });

    await prisma.bookingLink.create({
      data: {
        mailboxId: firstMailboxId,
        slug: "john-30min",
        title: "30-minute meeting with John",
        description: "Pick a time that works for you.",
        durationMins: 30,
        timezone: "UTC",
        availability: { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "13:00"]] },
      },
    });
  }

  console.log("\n✅ Demo data ready.\n");
  console.log("  Admin panel  → http://localhost:5173");
  console.log("    super admin : admin@ezmails.local / Admin@12345");
  console.log("    reseller    : reseller@ezmails.local / Reseller@123");
  console.log("    customer    : customer@ezmails.local / Customer@123");
  console.log("  Webmail      → http://localhost:5173/webmail/login");
  console.log("    mailbox     : john@demo.local / Demo@12345");
  console.log("    mailbox     : jane@demo.local / Demo@12345");
  console.log("  Public booking → http://localhost:5173/book/john-30min\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

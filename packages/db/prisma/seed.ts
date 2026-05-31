// Seeds the initial super_admin from env vars set by the installer.
// Idempotent: running twice will not create duplicates.
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Emails are stored lowercase to match login, which looks up by email.toLowerCase().
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("[seed] SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }

  const cost = parseInt(process.env.BCRYPT_COST ?? "12", 10);
  const passwordHash = await bcrypt.hash(password, cost);

  const admin = await prisma.user.upsert({
    where: { email },
    // Re-running resets the password + ensures the role — lets you recover a lost login.
    update: { passwordHash, role: UserRole.super_admin },
    create: {
      email,
      displayName: "Administrator",
      passwordHash,
      role: UserRole.super_admin,
    },
  });

  console.log(`[seed] super_admin ready: ${admin.email}`);

  // Optional portal users (reseller / customer) — created only when the installer
  // collected credentials. No demo mailboxes are ever seeded in production.
  let resellerId: string | undefined;
  const resellerEmail = process.env.SEED_RESELLER_EMAIL?.toLowerCase();
  const resellerPassword = process.env.SEED_RESELLER_PASSWORD;
  if (resellerEmail && resellerPassword) {
    const resellerHash = await bcrypt.hash(resellerPassword, cost);
    const reseller = await prisma.user.upsert({
      where: { email: resellerEmail },
      update: { passwordHash: resellerHash, role: UserRole.reseller },
      create: {
        email: resellerEmail,
        displayName: "Reseller",
        passwordHash: resellerHash,
        role: UserRole.reseller,
        maxCustomers: 20,
        maxDomains: 50,
        storagePool: BigInt(50) * 1024n * 1024n * 1024n,
      },
    });
    resellerId = reseller.id;
    console.log(`[seed] reseller ready: ${reseller.email}`);
  }

  const customerEmail = process.env.SEED_CUSTOMER_EMAIL?.toLowerCase();
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD;
  if (customerEmail && customerPassword) {
    const customerHash = await bcrypt.hash(customerPassword, cost);
    const customer = await prisma.user.upsert({
      where: { email: customerEmail },
      update: { passwordHash: customerHash, role: UserRole.customer },
      create: {
        email: customerEmail,
        displayName: "Customer",
        passwordHash: customerHash,
        role: UserRole.customer,
        ...(resellerId ? { parentId: resellerId } : {}),
      },
    });
    console.log(`[seed] customer ready: ${customer.email}`);
  }

  // Register the bundled primary mail node so the dashboard/queue can reach its
  // agent (hostname matches the docker-compose service name).
  const nodeHost = process.env.SEED_NODE_HOST ?? "postfix";
  const existingNode = await prisma.node.findUnique({ where: { hostname: nodeHost } });
  if (!existingNode) {
    await prisma.node.create({
      data: { name: "primary", hostname: nodeHost, ipAddress: "127.0.0.1", status: "online" },
    });
    console.log(`[seed] primary node registered: ${nodeHost}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

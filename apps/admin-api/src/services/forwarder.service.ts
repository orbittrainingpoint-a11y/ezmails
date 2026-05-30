import { prisma, type Domain } from "@ezmails/db";
import { Errors, AppError } from "../lib/errors.js";
import { resolveDns, normaliseTxt } from "../lib/dns.js";

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/** FWD-003: detect a DMARC reject policy on the destination domain. */
export async function destinationHasDmarcReject(destination: string): Promise<boolean> {
  const dom = destination.split("@")[1];
  if (!dom) return false;
  try {
    const txts = (await resolveDns(`_dmarc.${dom}`, "TXT")).map(normaliseTxt);
    const dmarc = txts.find((t) => t.toLowerCase().startsWith("v=dmarc1"));
    return !!dmarc && /\bp\s*=\s*reject\b/i.test(dmarc);
  } catch {
    return false;
  }
}

/** FWD-001/002: forward a local address to an external one, optionally keeping a copy. */
export async function createForwarder(
  domain: Domain,
  input: { source: string; destination: string; keepCopy?: boolean },
) {
  const local = input.source.includes("@") ? input.source.split("@")[0]! : input.source;
  const source = `${local.trim().toLowerCase()}@${domain.domainName}`;
  const destination = input.destination.trim().toLowerCase();
  if (!EMAIL.test(destination)) throw new AppError(400, "INVALID_FORWARDER", "Invalid destination address.");

  const dup = await prisma.forwarder.findFirst({ where: { domainId: domain.id, source, destination } });
  if (dup) throw Errors.conflict("That forwarder already exists.");

  const forwarder = await prisma.forwarder.create({
    data: { domainId: domain.id, source, destination, keepCopy: input.keepCopy ?? false },
  });

  // Surface a non-blocking warning (FWD-003) for the UI.
  const dmarcWarning = (await destinationHasDmarcReject(destination))
    ? `${destination.split("@")[1]} publishes a DMARC reject policy; forwarded mail may be rejected.`
    : null;

  return { forwarder, dmarcWarning };
}

export async function listForwarders(domainId: string) {
  return prisma.forwarder.findMany({ where: { domainId }, orderBy: { source: "asc" } });
}

export async function getForwarder(id: string) {
  const fwd = await prisma.forwarder.findUnique({ where: { id } });
  if (!fwd) throw Errors.notFound("Forwarder not found.");
  return fwd;
}

export async function deleteForwarder(id: string) {
  await prisma.forwarder.delete({ where: { id } });
}

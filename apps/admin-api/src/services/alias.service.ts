import { prisma, type Domain } from "@ezmails/db";
import { Errors, AppError } from "../lib/errors.js";

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function normaliseSource(input: string, domain: Domain, isWildcard: boolean): string {
  if (isWildcard) return `*@${domain.domainName}`;
  const raw = input.trim().toLowerCase();
  const local = raw.includes("@") ? raw.split("@")[0]! : raw;
  return `${local}@${domain.domainName}`;
}

/** ALI-001/002: create an alias routing to one or more destinations (or a wildcard). */
export async function createAlias(
  domain: Domain,
  input: { source: string; destination: string; isWildcard?: boolean },
) {
  const isWildcard = input.isWildcard ?? false;
  const source = normaliseSource(input.source, domain, isWildcard);

  const targets = input.destination.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (targets.length === 0) throw new AppError(400, "INVALID_ALIAS", "At least one destination is required.");
  for (const t of targets) if (!EMAIL.test(t)) throw new AppError(400, "INVALID_ALIAS", `Invalid destination: ${t}`);

  const dup = await prisma.alias.findFirst({ where: { domainId: domain.id, source } });
  if (dup) throw Errors.conflict("An alias for that address already exists.");

  return prisma.alias.create({
    data: { domainId: domain.id, source, destination: targets.join(","), isWildcard },
  });
}

export async function listAliases(domainId: string) {
  return prisma.alias.findMany({ where: { domainId }, orderBy: { source: "asc" } });
}

/** ALI-004: edit alias destination without recreating it. */
export async function updateAliasDestination(id: string, destination: string) {
  const targets = destination.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (targets.length === 0) throw new AppError(400, "INVALID_ALIAS", "At least one destination is required.");
  for (const t of targets) if (!EMAIL.test(t)) throw new AppError(400, "INVALID_ALIAS", `Invalid destination: ${t}`);

  const alias = await prisma.alias.findUnique({ where: { id } });
  if (!alias) throw Errors.notFound("Alias not found.");
  return prisma.alias.update({ where: { id }, data: { destination: targets.join(",") } });
}

export async function getAlias(id: string) {
  const alias = await prisma.alias.findUnique({ where: { id } });
  if (!alias) throw Errors.notFound("Alias not found.");
  return alias;
}

export async function deleteAlias(id: string) {
  await prisma.alias.delete({ where: { id } });
}

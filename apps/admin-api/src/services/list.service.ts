import { prisma, type Domain } from "@ezmails/db";
import { Errors, AppError } from "../lib/errors.js";

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/** LIST-001/002: create a mailing list with an address and an initial member set. */
export async function createList(
  domain: Domain,
  input: { localPart: string; name: string; moderated?: boolean; members?: string[] },
) {
  const local = input.localPart.includes("@") ? input.localPart.split("@")[0]! : input.localPart;
  const address = `${local.trim().toLowerCase()}@${domain.domainName}`;

  const dup = await prisma.mailingList.findUnique({ where: { address } });
  if (dup) throw Errors.conflict("A list with that address already exists.");

  const members = (input.members ?? []).map((m) => m.trim().toLowerCase()).filter(Boolean);
  for (const m of members) if (!EMAIL.test(m)) throw new AppError(400, "INVALID_MEMBER", `Invalid member: ${m}`);

  return prisma.mailingList.create({
    data: {
      domainId: domain.id,
      address,
      name: input.name,
      moderated: input.moderated ?? false,
      members: { create: [...new Set(members)].map((email) => ({ email })) },
    },
    include: { members: true },
  });
}

export async function listLists(domainId: string) {
  return prisma.mailingList.findMany({
    where: { domainId },
    orderBy: { address: "asc" },
    include: { _count: { select: { members: true } } },
  });
}

export async function getList(id: string) {
  const list = await prisma.mailingList.findUnique({ where: { id }, include: { members: true } });
  if (!list) throw Errors.notFound("Mailing list not found.");
  return list;
}

/** LIST-002: add members individually or in bulk (deduped). */
export async function addMembers(listId: string, emails: string[]) {
  const clean = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  for (const e of clean) if (!EMAIL.test(e)) throw new AppError(400, "INVALID_MEMBER", `Invalid member: ${e}`);
  await prisma.mailingListMember.createMany({
    data: [...new Set(clean)].map((email) => ({ listId, email })),
    skipDuplicates: true,
  });
  return getList(listId);
}

export async function removeMember(memberId: string) {
  await prisma.mailingListMember.delete({ where: { id: memberId } });
}

export async function deleteList(id: string) {
  await prisma.mailingList.delete({ where: { id } });
}

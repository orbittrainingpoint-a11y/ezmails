import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { prisma } from "@ezmails/db";
import { redis } from "../lib/redis.js";
import { env } from "../config/env.js";

const RP_NAME = "Infinit Email";

/** Relying-party identity derived from the public webmail URL. */
function rp(): { rpID: string; origin: string } {
  const url = new URL(env.WEBMAIL_URL);
  return { rpID: url.hostname, origin: url.origin };
}

const regKey = (mailboxId: string) => `webauthn:reg:${mailboxId}`;
const txports = (s: string | null): AuthenticatorTransportFuture[] | undefined =>
  s ? (s.split(",") as AuthenticatorTransportFuture[]) : undefined;

export async function listPasskeys(mailboxId: string) {
  return prisma.mailboxPasskey.findMany({
    where: { mailboxId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
  });
}

export async function hasPasskeys(mailboxId: string): Promise<boolean> {
  return (await prisma.mailboxPasskey.count({ where: { mailboxId } })) > 0;
}

export async function getRegistrationOptions(mailboxId: string, email: string) {
  const { rpID } = rp();
  const existing = await prisma.mailboxPasskey.findMany({ where: { mailboxId } });
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(mailboxId),
    userName: email,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: txports(c.transports) })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await redis.set(regKey(mailboxId), options.challenge, "EX", 300);
  return options;
}

export async function verifyRegistration(mailboxId: string, response: RegistrationResponseJSON, name: string) {
  const expectedChallenge = await redis.get(regKey(mailboxId));
  if (!expectedChallenge) throw new Error("Registration expired — please try again.");
  const { rpID, origin } = rp();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) throw new Error("Passkey could not be verified.");
  await redis.del(regKey(mailboxId));

  const { credential } = verification.registrationInfo;
  await prisma.mailboxPasskey.create({
    data: {
      mailboxId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports?.join(",") ?? null,
      name: name.trim().slice(0, 100) || "Passkey",
    },
  });
  return { verified: true };
}

export async function deletePasskey(mailboxId: string, id: string) {
  await prisma.mailboxPasskey.deleteMany({ where: { id, mailboxId } });
}

/** Build login assertion options for a mailbox's passkeys (null if none). */
export async function getAuthenticationOptions(mailboxId: string) {
  const { rpID } = rp();
  const creds = await prisma.mailboxPasskey.findMany({ where: { mailboxId } });
  if (creds.length === 0) return null;
  return generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({ id: c.credentialId, transports: txports(c.transports) })),
    userVerification: "preferred",
  });
}

export async function verifyAuthentication(mailboxId: string, response: AuthenticationResponseJSON, expectedChallenge: string): Promise<boolean> {
  const { rpID, origin } = rp();
  const cred = await prisma.mailboxPasskey.findUnique({ where: { credentialId: response.id } });
  if (!cred || cred.mailboxId !== mailboxId) return false;

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: Number(cred.counter),
      transports: txports(cred.transports),
    },
  });
  if (!verification.verified) return false;
  await prisma.mailboxPasskey.update({
    where: { id: cred.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });
  return true;
}

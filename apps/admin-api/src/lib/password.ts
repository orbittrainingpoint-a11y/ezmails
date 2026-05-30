import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

/**
 * Produce a Dovecot-compatible password value for a mailbox.
 *
 * We store it with an explicit `{BLF-CRYPT}` scheme prefix (bcrypt). Dovecot
 * honours the per-record scheme prefix over the configured default, and
 * BLF-CRYPT is a first-class, well-vetted scheme in Dovecot — stronger and
 * simpler to generate from Node than hand-rolling SHA512-CRYPT. The stored
 * value looks like: {BLF-CRYPT}$2a$12$....
 */
export function dovecotPassword(plain: string): string {
  return `{BLF-CRYPT}${bcrypt.hashSync(plain, env.BCRYPT_COST)}`;
}

/** Minimal server-side password policy (the UI shows a strength meter — MBX-002). */
export function assertPasswordPolicy(plain: string): string | null {
  if (plain.length < 8) return "Password must be at least 8 characters.";
  return null;
}

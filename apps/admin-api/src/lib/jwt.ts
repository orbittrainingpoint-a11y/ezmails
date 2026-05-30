import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";

const enc = new TextEncoder();
const currentKey = enc.encode(env.JWT_SECRET);
const previousKey = env.JWT_SECRET_PREVIOUS ? enc.encode(env.JWT_SECRET_PREVIOUS) : null;
const ALG = "HS512";

export interface AccessClaims extends JWTPayload {
  sub: string;
  role: "super_admin" | "reseller" | "customer";
}

/** Sign a short-lived access token. */
export async function signAccessToken(claims: { sub: string; role: AccessClaims["role"] }): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(currentKey);
}

/**
 * Verify an access token. During secret rotation, accept the previous key too,
 * so tokens issued before a rotation stay valid for their remaining lifetime.
 */
export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, currentKey, { algorithms: [ALG] });
    return payload as AccessClaims;
  } catch (err) {
    if (previousKey) {
      const { payload } = await jwtVerify(token, previousKey, { algorithms: [ALG] });
      return payload as AccessClaims;
    }
    throw err;
  }
}

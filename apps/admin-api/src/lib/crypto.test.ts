import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, sha256hex, randomToken, recoveryCode } from "./crypto.js";

describe("crypto", () => {
  it("round-trips AES-256-GCM encryption", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces distinct ciphertext per call (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", () => {
    const enc = encryptSecret("hello");
    const [iv, tag, data] = enc.split(".");
    // Flip the first character of the auth tag → GCM verification must fail.
    const flipped = (tag![0] === "A" ? "B" : "A") + tag!.slice(1);
    expect(() => decryptSecret(`${iv}.${flipped}.${data}`)).toThrow();
  });

  it("sha256hex is deterministic and 64 chars", () => {
    expect(sha256hex("a")).toBe(sha256hex("a"));
    expect(sha256hex("a")).toHaveLength(64);
  });

  it("randomToken is unique", () => {
    expect(randomToken()).not.toBe(randomToken());
  });

  it("recoveryCode matches XXXX-XXXX format", () => {
    expect(recoveryCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});

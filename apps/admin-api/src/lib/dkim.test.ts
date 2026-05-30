import { describe, it, expect } from "vitest";
import { generateDkimKey, makeSelector } from "./dkim.js";
import { normaliseTxt, stripTrailingDot } from "./dns.js";

describe("dkim", () => {
  it("generates a valid RSA key pair and DNS value", () => {
    const k = generateDkimKey();
    expect(k.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(k.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    expect(k.dnsValue).toMatch(/^v=DKIM1; k=rsa; p=[A-Za-z0-9+/=]+$/);
  });

  it("selector is base-prefixed and date-stamped", () => {
    expect(makeSelector("ezmails")).toMatch(/^ezmails-\d{8}$/);
  });
});

describe("dns helpers", () => {
  it("joins multi-chunk TXT and strips quotes", () => {
    expect(normaliseTxt('"v=spf1 " "mx ~all"')).toBe("v=spf1 mx ~all");
  });
  it("strips trailing dot from FQDN", () => {
    expect(stripTrailingDot("mail.example.com.")).toBe("mail.example.com");
  });
});

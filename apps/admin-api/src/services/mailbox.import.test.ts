import { describe, it, expect } from "vitest";
import { previewImport, type ImportRow } from "./mailbox.service.js";

// Minimal Domain stub — previewImport only reads domainName + maxMailboxes.
const domain = { id: "d1", domainName: "example.com", maxMailboxes: 100 } as never;

describe("mailbox import preview", () => {
  it("accepts a valid row", () => {
    const rows: ImportRow[] = [{ address: "john@example.com", password: "secret123" }];
    const [r] = previewImport(rows, domain);
    expect(r!.valid).toBe(true);
    expect(r!.address).toBe("john@example.com");
  });

  it("rejects wrong domain, weak password, and duplicates", () => {
    const rows: ImportRow[] = [
      { address: "a@other.com", password: "secret123" }, // wrong domain
      { address: "b@example.com", password: "short" }, // weak
      { address: "c@example.com", password: "secret123" },
      { address: "c@example.com", password: "secret123" }, // dup
    ];
    const res = previewImport(rows, domain);
    expect(res[0]!.errors).toContain("Address must be @example.com.");
    expect(res[1]!.errors[0]).toMatch(/at least 8/);
    expect(res[2]!.valid).toBe(true);
    expect(res[3]!.errors).toContain("Duplicate address in file.");
  });

  it("accepts bare local parts", () => {
    const [r] = previewImport([{ address: "sales", password: "secret123" }], domain);
    expect(r!.valid).toBe(true);
    expect(r!.address).toBe("sales@example.com");
  });
});

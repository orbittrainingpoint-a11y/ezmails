import { describe, it, expect } from "vitest";
import { safeInlineContentType } from "./mail.routes.js";

describe("safeInlineContentType — attachment preview XSS regression", () => {
  it("serves a genuinely-safe image type inline", () => {
    const r = safeInlineContentType("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47]), false);
    expect(r).toEqual({ contentType: "image/png", disposition: "inline" });
  });

  it("serves a real PDF (magic bytes present) inline", () => {
    const r = safeInlineContentType("application/pdf", Buffer.from("%PDF-1.4\n..."), false);
    expect(r).toEqual({ contentType: "application/pdf", disposition: "inline" });
  });

  it("refuses to serve a spoofed PDF inline — declared type doesn't match the actual bytes", () => {
    // The exact attack: an attachment named/declared as a PDF whose real content is HTML/script.
    const html = Buffer.from("<script>fetch('/webmail-api/messages',{credentials:'include'})</script>");
    const r = safeInlineContentType("application/pdf", html, false);
    expect(r.disposition).toBe("attachment");
  });

  it("never serves an arbitrary declared content-type inline, even without a magic-byte concern", () => {
    const r = safeInlineContentType("text/html", Buffer.from("<script>alert(1)</script>"), false);
    expect(r.disposition).toBe("attachment");
  });

  it("always forces attachment disposition when the client explicitly asks to download", () => {
    const r = safeInlineContentType("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47]), true);
    expect(r.disposition).toBe("attachment");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMail, broadcast, domainUpdate, mailLogFindFirst } = vi.hoisted(() => ({
  sendMail: vi.fn(),
  broadcast: vi.fn(),
  domainUpdate: vi.fn(),
  mailLogFindFirst: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

vi.mock("../lib/dns.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/dns.js")>("../lib/dns.js");
  return { ...actual, resolveDns: vi.fn() };
});

vi.mock("../lib/ws-hub.js", () => ({ broadcast }));

vi.mock("@ezmails/db", () => ({
  prisma: {
    domain: { update: domainUpdate },
    mailLog: { findFirst: mailLogFindFirst },
  },
}));

import { resolveDns } from "../lib/dns.js";
import { runDeliveryTestInternal } from "./delivery-test.service.js";

const mockResolveDns = vi.mocked(resolveDns);

describe("runDeliveryTestInternal", () => {
  beforeEach(() => {
    sendMail.mockReset();
    mockResolveDns.mockReset();
    broadcast.mockReset();
    domainUpdate.mockReset();
    mailLogFindFirst.mockReset();
  });

  it("passes when Postfix accepts the message and mail_log later shows delivered", async () => {
    mockResolveDns.mockResolvedValueOnce(["10 mail.example.com."]);
    sendMail.mockResolvedValueOnce({ response: "250 2.0.0 Ok: queued as ABC123" });
    mailLogFindFirst.mockResolvedValueOnce({ status: "delivered" });

    await runDeliveryTestInternal("d1", "example.com", "user@example.com", {
      pollIntervalMs: 5,
      pollTimeoutMs: 200,
    });

    expect(domainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastDeliveryTestStatus: "passed" }) }),
    );
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "passed" }) }),
    );
  });

  it("flags 'unexpected_response' when the MX doesn't look like this server (the assessexpert.com failure mode)", async () => {
    mockResolveDns.mockResolvedValueOnce(["10 eforward1.registrar-servers.com."]);
    sendMail.mockResolvedValueOnce({ response: "250 OK id=1uAbCd-000000-Ef" });

    await runDeliveryTestInternal("d1", "example.com", "user@example.com", {
      pollIntervalMs: 5,
      pollTimeoutMs: 200,
    });

    expect(domainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastDeliveryTestStatus: "unexpected_response" }) }),
    );
    const [call] = domainUpdate.mock.calls;
    expect((call![0] as { data: { lastDeliveryTestDetail: string } }).data.lastDeliveryTestDetail).toMatch(
      /check that MX/,
    );
  });

  it("times out when the message is queued but mail_log never shows delivery", async () => {
    mockResolveDns.mockResolvedValueOnce(["10 mail.example.com."]);
    sendMail.mockResolvedValueOnce({ response: "250 2.0.0 Ok: queued as XYZ789" });
    mailLogFindFirst.mockResolvedValue(null);

    await runDeliveryTestInternal("d1", "example.com", "user@example.com", {
      pollIntervalMs: 5,
      pollTimeoutMs: 30,
    });

    expect(domainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastDeliveryTestStatus: "timeout" }) }),
    );
  });

  it("fails cleanly when the MX can't be resolved", async () => {
    mockResolveDns.mockRejectedValueOnce(new Error("DoH query failed: 500"));

    await runDeliveryTestInternal("d1", "example.com", "user@example.com");

    expect(sendMail).not.toHaveBeenCalled();
    expect(domainUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastDeliveryTestStatus: "failed" }) }),
    );
  });

  it("reports bounced delivery as failed with the bounce reason", async () => {
    mockResolveDns.mockResolvedValueOnce(["10 mail.example.com."]);
    sendMail.mockResolvedValueOnce({ response: "250 2.0.0 Ok: queued as BOUNCE1" });
    mailLogFindFirst.mockResolvedValueOnce({ status: "bounced", detail: "550 mailbox full" });

    await runDeliveryTestInternal("d1", "example.com", "user@example.com", {
      pollIntervalMs: 5,
      pollTimeoutMs: 200,
    });

    const [call] = domainUpdate.mock.calls;
    expect((call![0] as { data: { lastDeliveryTestDetail: string } }).data.lastDeliveryTestDetail).toBe(
      "550 mailbox full",
    );
  });
});

import { prisma, type DnsRecordType, DnsStatus } from "@ezmails/db";
import { env } from "../config/env.js";
import { resolveDns, normaliseTxt, stripTrailingDot } from "../lib/dns.js";

export interface GeneratedRecord {
  recordType: DnsRecordType;
  hostname: string;
  expectedValue: string;
}

/**
 * DOM-002: derive the MX/SPF/DKIM/DMARC records a domain needs. The DKIM value
 * comes from the freshly generated key (passed in).
 */
export function buildDnsRecords(
  domainName: string,
  dkim: { selector: string; dnsValue: string },
): GeneratedRecord[] {
  const mailHost = env.MAIL_HOSTNAME;
  return [
    { recordType: "MX", hostname: domainName, expectedValue: `10 ${mailHost}` },
    { recordType: "SPF", hostname: domainName, expectedValue: `v=spf1 a:${mailHost} mx ~all` },
    {
      recordType: "DKIM",
      hostname: `${dkim.selector}._domainkey.${domainName}`,
      expectedValue: dkim.dnsValue,
    },
    {
      recordType: "DMARC",
      hostname: `_dmarc.${domainName}`,
      expectedValue: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domainName}; fo=1`,
    },
  ];
}

/** Compare a single expected record against live DNS. */
async function checkRecord(rec: {
  recordType: DnsRecordType;
  hostname: string;
  expectedValue: string;
}): Promise<{ status: DnsStatus; actual: string | null }> {
  try {
    if (rec.recordType === "MX") {
      const answers = (await resolveDns(rec.hostname, "MX")).map((a) =>
        stripTrailingDot(a.split(/\s+/).pop() ?? "").toLowerCase(),
      );
      if (answers.length === 0) return { status: DnsStatus.missing, actual: null };
      const wanted = stripTrailingDot(rec.expectedValue.split(/\s+/).pop()!).toLowerCase();
      return {
        status: answers.includes(wanted) ? DnsStatus.valid : DnsStatus.incorrect,
        actual: answers.join(", "),
      };
    }

    // SPF / DKIM / DMARC are all TXT records.
    const txts = (await resolveDns(rec.hostname, "TXT")).map(normaliseTxt);
    if (txts.length === 0) return { status: DnsStatus.missing, actual: null };

    const expected = rec.expectedValue.replace(/\s+/g, "");
    if (rec.recordType === "DKIM") {
      // Match on the p= public key — formatting/ordering of tags may differ.
      const wantedP = /p=([A-Za-z0-9+/=]+)/.exec(rec.expectedValue)?.[1];
      const found = txts.find((t) => wantedP && t.replace(/\s+/g, "").includes(`p=${wantedP}`));
      return { status: found ? DnsStatus.valid : DnsStatus.incorrect, actual: txts.join(" | ") };
    }
    if (rec.recordType === "SPF") {
      const spf = txts.find((t) => t.toLowerCase().startsWith("v=spf1"));
      if (!spf) return { status: DnsStatus.missing, actual: txts.join(" | ") };
      const includesHost = spf.toLowerCase().includes(env.MAIL_HOSTNAME.toLowerCase());
      return { status: includesHost ? DnsStatus.valid : DnsStatus.incorrect, actual: spf };
    }
    // DMARC
    const dmarc = txts.find((t) => t.toLowerCase().startsWith("v=dmarc1"));
    return {
      status: dmarc ? DnsStatus.valid : DnsStatus.missing,
      actual: dmarc ?? txts.join(" | "),
    };
  } catch {
    // Resolution error → treat as still propagating rather than a hard failure.
    return { status: DnsStatus.propagating, actual: null };
  }
}

/** DOM-005/006: re-check every DNS record for a domain and persist the result. */
export async function validateDomainDns(domainId: string) {
  const records = await prisma.dnsRecord.findMany({ where: { domainId } });
  const now = new Date();

  const results = await Promise.all(
    records.map(async (r) => {
      const { status, actual } = await checkRecord({
        recordType: r.recordType,
        hostname: r.hostname ?? "",
        expectedValue: r.expectedValue,
      });
      await prisma.dnsRecord.update({
        where: { id: r.id },
        data: { status, actualValue: actual, lastChecked: now },
      });
      return { id: r.id, recordType: r.recordType, status };
    }),
  );

  return results;
}

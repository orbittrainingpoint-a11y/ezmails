import { prisma, type DnsRecordType, type DomainSource, DnsStatus } from "@ezmails/db";
import { env } from "../config/env.js";
import { resolveDns, normaliseTxt, stripTrailingDot } from "../lib/dns.js";

export interface GeneratedRecord {
  recordType: DnsRecordType;
  hostname: string;
  expectedValue: string;
}

/**
 * DOM-002: derive the MX/SPF/DKIM/DMARC records a domain needs. The DKIM value
 * comes from the freshly generated key (passed in). An "external" domain keeps
 * inbound mail routed elsewhere (e.g. a registrar forwarder) so no MX record
 * pointing here is required — only the outbound-auth records apply.
 */
export function buildDnsRecords(
  domainName: string,
  dkim: { selector: string; dnsValue: string },
  sourceType: DomainSource = "vps_hosted",
): GeneratedRecord[] {
  const mailHost = env.MAIL_HOSTNAME;
  const records: GeneratedRecord[] = [];
  if (sourceType === "vps_hosted") {
    records.push({ recordType: "MX", hostname: domainName, expectedValue: `10 ${mailHost}` });
  }
  records.push(
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
  );
  return records;
}

/**
 * DOM-002b: keep a domain's `dns_records` rows in sync when `sourceType`
 * changes after creation — add the MX row if it switched to vps_hosted and
 * none exists, remove it if it switched to external.
 */
export async function syncDnsRecordsForSourceType(
  domainId: string,
  domainName: string,
  sourceType: DomainSource,
): Promise<void> {
  const existingMx = await prisma.dnsRecord.findFirst({ where: { domainId, recordType: "MX" } });
  if (sourceType === "vps_hosted" && !existingMx) {
    await prisma.dnsRecord.create({
      data: {
        domainId,
        recordType: "MX",
        hostname: domainName,
        expectedValue: `10 ${env.MAIL_HOSTNAME}`,
        status: "unchecked",
      },
    });
  } else if (sourceType === "external" && existingMx) {
    await prisma.dnsRecord.delete({ where: { id: existingMx.id } });
  }
}

/** Compare a single expected record against live DNS. Exported for unit testing. */
export async function checkRecord(rec: {
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
      const spfRecords = txts.filter((t) => t.toLowerCase().startsWith("v=spf1"));
      if (spfRecords.length === 0) return { status: DnsStatus.missing, actual: txts.join(" | ") };
      if (spfRecords.length > 1) {
        return {
          status: DnsStatus.incorrect,
          actual: `${spfRecords.length} SPF records found (RFC 7208 PermError — remove the duplicate): ${spfRecords.join(" | ")}`,
        };
      }
      const spf = spfRecords[0]!;
      const includesHost = spf.toLowerCase().includes(env.MAIL_HOSTNAME.toLowerCase());
      return { status: includesHost ? DnsStatus.valid : DnsStatus.incorrect, actual: spf };
    }
    // DMARC
    const dmarcRecords = txts.filter((t) => t.toLowerCase().startsWith("v=dmarc1"));
    if (dmarcRecords.length > 1) {
      return {
        status: DnsStatus.incorrect,
        actual: `${dmarcRecords.length} DMARC records found (invalid per RFC 7489 — remove the duplicate): ${dmarcRecords.join(" | ")}`,
      };
    }
    return {
      status: dmarcRecords.length === 1 ? DnsStatus.valid : DnsStatus.missing,
      actual: dmarcRecords[0] ?? txts.join(" | "),
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

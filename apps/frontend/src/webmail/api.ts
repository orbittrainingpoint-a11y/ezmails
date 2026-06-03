const BASE = "/webmail-api";

export class WmError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/** Webmail API client — cookie-authenticated (httpOnly session), same-origin. */
export async function wm<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = opts.body !== undefined;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    // Only set JSON content-type when there's a body — otherwise Fastify rejects
    // an "empty JSON body" (FST_ERR_CTP_EMPTY_JSON_BODY) on bodyless POSTs.
    headers: hasBody ? { "content-type": "application/json" } : {},
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    if (!res.ok) throw new WmError(res.status, "HTTP_ERROR", res.statusText);
    return (await res.blob()) as unknown as T;
  }
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok || !json.success) throw new WmError(res.status, json.error?.code ?? "ERROR", json.error?.message ?? "Request failed");
  return json.data as T;
}

// ── Types ──
export interface Folder {
  path: string;
  name: string;
  specialUse: string | null;
}
export interface MessageListItem {
  uid: number;
  subject: string;
  from: { name: string; address: string }[];
  to: { name: string; address: string }[];
  date: string | null;
  size: number;
  seen: boolean;
  flagged: boolean;
  hasAttachments: boolean;
}
export interface MessageFull extends MessageListItem {
  messageId: string;
  cc: { name: string; address: string }[];
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  attachments: { index: number; filename: string; contentType: string; size: number }[];
}
export interface WmContact {
  id: string;
  name: string;
  emails: string[];
  phone: string | null;
  notes: string | null;
}
export interface WmSettings {
  signatureHtml: string | null;
  vacationEnabled: boolean;
  vacationSubject: string | null;
  vacationMessage: string | null;
}

// ── Calls ──
export type LoginResult =
  | { token: string; profile: { email: string; displayName: string | null } }
  | { mfaRequired: true; mfaToken: string };
export const isMfaChallenge = (r: LoginResult): r is { mfaRequired: true; mfaToken: string } =>
  (r as { mfaRequired?: boolean }).mfaRequired === true;
export const wmLogin = (email: string, password: string) =>
  wm<LoginResult>("/auth/login", { method: "POST", body: { email, password } });
export const wmMfa = (mfaToken: string, code: string) =>
  wm<{ token: string; profile: { email: string; displayName: string | null } }>("/auth/mfa", { method: "POST", body: { mfaToken, code } });
export const wmMe = () => wm<{ email: string; displayName: string | null; totpEnabled?: boolean }>("/auth/me");
export const wmLogout = () => wm("/auth/logout", { method: "POST" });

// 2FA management
export const wm2faSetup = () => wm<{ otpauth: string; qrDataUrl: string; recoveryCodes: string[] }>("/auth/2fa/setup", { method: "POST" });
export const wm2faVerify = (code: string) => wm<{ totpEnabled: boolean }>("/auth/2fa/verify", { method: "POST", body: { code } });
export const wm2faDisable = () => wm("/auth/2fa/disable", { method: "POST" });

// App passwords (configure this mailbox in external IMAP/SMTP clients)
export interface AppPassword { id: string; label: string; lastUsedAt: string | null; createdAt: string }
export const wmAppPasswords = () => wm<AppPassword[]>("/app-passwords");
export const wmCreateAppPassword = (label: string) =>
  wm<{ id: string; label: string; createdAt: string; password: string }>("/app-passwords", { method: "POST", body: { label } });
export const wmRevokeAppPassword = (id: string) => wm(`/app-passwords/${id}`, { method: "DELETE" });

// Calendars shared with me (read-only)
export interface SharedCalEvent { id: string; title: string; startsAt: string; endsAt: string; notes?: string; link?: string }
export interface SharedCalendar { id: string; name: string; color: string; perm: "view" | "edit"; ownerEmail: string; ownerName: string | null; events: SharedCalEvent[] }
export const wmSharedCalendars = () => wm<SharedCalendar[]>("/calendars/shared");

// Folder management
export const wmCreateFolder = (path: string) => wm<{ path: string }>("/folders", { method: "POST", body: { path } });
export const wmDeleteFolder = (path: string) => wm("/folders/delete", { method: "POST", body: { path } });

// Inbox rules (Outlook-style)
export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  matchType: "all" | "any";
  conditions: { field: string; op: string; value: string }[];
  targetFolder: string;
  markRead: boolean;
}
export const wmRules = () => wm<Rule[]>("/rules");
export const wmCreateRule = (body: unknown) => wm<Rule>("/rules", { method: "POST", body });
export const wmUpdateRule = (id: string, body: unknown) => wm<Rule>(`/rules/${id}`, { method: "PATCH", body });
export const wmDeleteRule = (id: string) => wm(`/rules/${id}`, { method: "DELETE" });
export const wmApplyRules = (folder = "INBOX") => wm<{ moved: number }>("/rules/apply", { method: "POST", body: { folder } });

// Email notes
export interface Note {
  id: string;
  messageId: string;
  title: string | null;
  body: string;
  color: string | null;
  pinned: boolean;
  updatedAt: string;
}
export const wmNotes = (messageId: string) => wm<Note[]>(`/notes?messageId=${encodeURIComponent(messageId)}`);
export const wmCreateNote = (body: unknown) => wm<Note>("/notes", { method: "POST", body });
export const wmUpdateNote = (id: string, body: unknown) => wm<Note>(`/notes/${id}`, { method: "PATCH", body });
export const wmDeleteNote = (id: string) => wm(`/notes/${id}`, { method: "DELETE" });

export const wmFolders = () => wm<Folder[]>("/folders");
export type FolderCounts = Record<string, { unread: number; total: number }>;
export const wmFolderCounts = () => wm<FolderCounts>("/folders/counts");
export const wmMessages = (folder: string, page: number, search?: string) => {
  const q = new URLSearchParams({ folder, page: String(page), pageSize: "50" });
  if (search) q.set("search", search);
  return wm<{ items: MessageListItem[]; total: number; page: number; pageSize: number }>(`/messages?${q}`);
};
export const wmMessage = (folder: string, uid: number) => wm<MessageFull>(`/messages/${uid}?folder=${encodeURIComponent(folder)}`);
export const wmSend = (body: unknown) => wm<{ messageId?: string; scheduled?: boolean; id?: string; scheduledAt?: string }>("/messages", { method: "POST", body });
export const wmSaveDraft = (body: unknown) => wm<{ ok: boolean }>("/messages/draft", { method: "POST", body });

export interface ScheduledMail {
  id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  scheduledAt: string;
  createdAt: string;
}
export const wmScheduled = () => wm<ScheduledMail[]>("/scheduled");
export const wmCancelScheduled = (id: string) => wm(`/scheduled/${id}`, { method: "DELETE" });
export const wmFlag = (folder: string, uid: number, changes: { seen?: boolean; flagged?: boolean }) =>
  wm(`/messages/${uid}`, { method: "PATCH", body: { folder, ...changes } });
export const wmTrash = (folder: string, uid: number) => wm(`/messages/${uid}?folder=${encodeURIComponent(folder)}`, { method: "DELETE" });
export const wmMove = (folder: string, uid: number, target: string) => wm(`/messages/${uid}/move`, { method: "POST", body: { folder, target } });
export const attachmentUrl = (folder: string, uid: number, index: number) =>
  `/webmail-api/messages/${uid}/attachments/${index}?folder=${encodeURIComponent(folder)}`;

export const wmContacts = () => wm<WmContact[]>("/contacts");
export const wmCreateContact = (body: unknown) => wm<WmContact>("/contacts", { method: "POST", body });
export const wmDeleteContact = (id: string) => wm(`/contacts/${id}`, { method: "DELETE" });

export const wmGetSettings = () => wm<WmSettings>("/settings");
export const wmSaveSettings = (body: unknown) => wm<WmSettings>("/settings", { method: "PUT", body });

// ── Titan: AI Smart Write ──
export const aiStatus = () => wm<{ enabled: boolean }>("/ai/status");
export const aiDraft = (instruction: string, tone?: string) =>
  wm<{ subject: string; body: string }>("/ai/draft", { method: "POST", body: { instruction, tone } });
export const aiReply = (original: string, instruction?: string, tone?: string) =>
  wm<{ body: string }>("/ai/reply", { method: "POST", body: { original, instruction, tone } });
export const aiSummarize = (text: string) =>
  wm<{ summary: string }>("/ai/summarize", { method: "POST", body: { text } });

// ── Titan: Email Campaigns ──
export interface Campaign {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  status: "draft" | "sending" | "sent" | "failed";
  recipientCount?: number;
  sent?: number;
  opened?: number;
  openRate?: number;
  createdAt: string;
}
export const wmCampaigns = () => wm<Campaign[]>("/campaigns");
export const wmCampaign = (id: string) => wm<Campaign & { sent: number; opened: number; openRate: number }>(`/campaigns/${id}`);
export const wmCreateCampaign = (body: unknown) => wm<Campaign>("/campaigns", { method: "POST", body });
export const wmUpdateCampaign = (id: string, body: unknown) => wm<Campaign>(`/campaigns/${id}`, { method: "PATCH", body });
export const wmDeleteCampaign = (id: string) => wm(`/campaigns/${id}`, { method: "DELETE" });
export const wmImportRecipients = (id: string, csv: string) =>
  wm<{ imported: number; skipped: number }>(`/campaigns/${id}/recipients`, { method: "POST", body: { csv } });
export const wmSendCampaign = (id: string) => wm<{ sent: number; total: number }>(`/campaigns/${id}/send`, { method: "POST" });

// ── Titan: Bookings ──
export type Availability = Record<string, [string, string][]>;
export interface BookingLink {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  durationMins: number;
  timezone: string;
  availability: Availability;
  isActive: boolean;
  _count?: { bookings: number };
}
export interface BookingRow {
  id: string;
  name: string;
  email: string;
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
  link: { title: string; slug: string };
}
export const wmBookingLinks = () => wm<BookingLink[]>("/booking-links");
export const wmCreateBookingLink = (body: unknown) => wm<BookingLink>("/booking-links", { method: "POST", body });
export const wmDeleteBookingLink = (id: string) => wm(`/booking-links/${id}`, { method: "DELETE" });
export const wmBookings = () => wm<BookingRow[]>("/bookings");
export const wmCancelBooking = (id: string) => wm(`/bookings/${id}/cancel`, { method: "POST" });

// Public (no auth) — used by the shareable booking page.
export const publicBooking = (slug: string) =>
  wm<{ title: string; description: string | null; durationMins: number; timezone: string; slots: string[] }>(`/public/bookings/${slug}`);
export const publicBook = (slug: string, body: unknown) =>
  wm<{ id: string; startsAt: string; endsAt: string }>(`/public/bookings/${slug}`, { method: "POST", body });
export const bookingIcsUrl = (id: string) => `/webmail-api/public/bookings/ics/${id}`;

// ── Advanced settings: account, forwarding, blocked senders, contacts import ──
export interface Account {
  email: string;
  displayName: string | null;
  domain: string;
  createdAt: string;
  lastLoginAt: string | null;
  storageUsedBytes: number;
  storageQuotaBytes: string;
}
export const wmAccount = () => wm<Account>("/account");
export const wmUpdateName = (displayName: string) => wm<{ displayName: string }>("/account", { method: "PATCH", body: { displayName } });
export const wmChangePassword = (current: string, next: string) => wm("/account/password", { method: "POST", body: { current, next } });

export interface Forward {
  id: string;
  source: string;
  destination: string;
  keepCopy: boolean;
}
export const wmForwarding = () => wm<Forward[]>("/forwarding");
export const wmAddForwarding = (destination: string, keepCopy: boolean) => wm<Forward>("/forwarding", { method: "POST", body: { destination, keepCopy } });
export const wmDeleteForwarding = (id: string) => wm(`/forwarding/${id}`, { method: "DELETE" });

export const wmBlockedSenders = () => wm<string[]>("/senders/blocked");
export const wmBlockSender = (email: string) => wm<string[]>("/senders/blocked", { method: "POST", body: { email } });
export const wmUnblockSender = (email: string) => wm<string[]>("/senders/blocked", { method: "DELETE", body: { email } });

export const wmImportContacts = (csv: string) => wm<{ imported: number; total: number }>("/contacts/import", { method: "POST", body: { csv } });

export interface ImapImportResult {
  folders: { folder: string; copied: number; skipped: number }[];
  copiedTotal: number;
  capped: boolean;
}
export const wmImportImap = (body: { host: string; port: number; secure: boolean; user: string; password: string; maxPerFolder?: number }) =>
  wm<ImapImportResult>("/import/imap", { method: "POST", body });

// Full webmail settings (extends the slim WmSettings used elsewhere).
export interface FullSettings extends WmSettings {
  vacationStart?: string | null;
  vacationEnd?: string | null;
  prefs?: Record<string, unknown> | null;
}
export const wmGetFullSettings = () => wm<FullSettings>("/settings");

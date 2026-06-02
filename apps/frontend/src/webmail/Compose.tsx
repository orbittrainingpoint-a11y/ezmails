import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Bold, Italic, Underline, List, ListOrdered, Link2, Paperclip, X, Send, Sparkles, FileText,
  MousePointerClick, Palette, Users, Smile, Image as ImageIcon, PenLine, Clock, Trash2,
  Minus, Maximize2, ChevronDown, AlignLeft,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { wmSend, wmSaveDraft, aiDraft, wmGetFullSettings, wmContacts, WmError } from "./api";
import { useWebmail } from "./store";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

interface Attachment { filename: string; contentBase64: string; contentType: string }
export interface ComposeInitial { to?: string; cc?: string; subject?: string; html?: string; focusBody?: boolean }

const EMOJIS = ["😀", "😉", "👍", "🙏", "🎉", "✅", "📎", "📅", "🚀", "❤️", "🔥", "💡"];

// Ready-made, email-safe body layouts inserted by the Compose → Design menu.
const DESIGN_TEMPLATES: { label: string; html: string }[] = [
  {
    label: "Announcement",
    html: `<table width="100%" style="max-width:560px;font-family:Arial,sans-serif"><tr><td style="background:#114b43;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0"><div style="font-size:20px;font-weight:700">We have news 🎉</div></td></tr>
<tr><td style="border:1px solid #eee;border-top:0;padding:24px;border-radius:0 0 8px 8px;color:#333;font-size:14px;line-height:1.6"><p>Hi there,</p><p>We're excited to share an update with you. [Write your announcement here.]</p><p style="margin-top:20px"><a href="#" style="display:inline-block;background:#114b43;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Learn more</a></p></td></tr></table>`,
  },
  {
    label: "Newsletter",
    html: `<table width="100%" style="max-width:560px;font-family:Arial,sans-serif;color:#333"><tr><td style="padding:16px 0;border-bottom:2px solid #114b43"><span style="font-size:18px;font-weight:700">Monthly Newsletter</span></td></tr>
<tr><td style="padding:20px 0;font-size:14px;line-height:1.6"><h3 style="margin:0 0 6px">Headline one</h3><p>[Story summary goes here.]</p><h3 style="margin:18px 0 6px">Headline two</h3><p>[Second story summary.]</p></td></tr>
<tr><td style="border-top:1px solid #eee;padding-top:12px;font-size:12px;color:#888">You're receiving this because you subscribed. <a href="#" style="color:#114b43">Unsubscribe</a></td></tr></table>`,
  },
  {
    label: "Promotion / Offer",
    html: `<table width="100%" style="max-width:520px;font-family:Arial,sans-serif;text-align:center"><tr><td style="padding:32px 24px;border:2px dashed #e67e22;border-radius:10px">
<div style="font-size:26px;font-weight:800;color:#e67e22">25% OFF</div><div style="font-size:14px;color:#555;margin:8px 0 18px">Limited-time offer just for you.</div>
<a href="#" style="display:inline-block;background:#e67e22;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700">Claim offer</a>
<div style="font-size:11px;color:#999;margin-top:14px">Use code <strong>SAVE25</strong> at checkout.</div></td></tr></table>`,
  },
  {
    label: "Meeting follow-up",
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6"><p>Hi [Name],</p><p>Thanks for taking the time to meet today. To recap what we discussed:</p><ul><li>[Point one]</li><li>[Point two]</li><li>[Next step]</li></ul><p>Let me know if I missed anything. Looking forward to next steps.</p></div>`,
  },
  {
    label: "Simple letter",
    html: `<div style="font-family:Georgia,serif;font-size:15px;color:#222;line-height:1.7;max-width:560px"><p>Dear [Name],</p><p>[Your message here.]</p><p style="margin-top:24px">Warm regards,<br/>[Your name]</p></div>`,
  },
];

export function Compose({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: ComposeInitial }) {
  const navigate = useNavigate();
  const editorRef = useRef<HTMLDivElement>(null);
  const fromEmail = useWebmail((s) => s.profile?.email ?? "");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [track, setTrack] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [closePrompt, setClosePrompt] = useState(false);
  const [size, setSize] = useState({ w: 640, h: 580 });

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY, startW = size.w, startH = size.h;
    const onMove = (ev: MouseEvent) => setSize({
      w: Math.min(Math.max(startW + (startX - ev.clientX), 380), window.innerWidth - 24),
      h: Math.min(Math.max(startH + (startY - ev.clientY), 340), window.innerHeight - 24),
    });
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    if (!open) return;
    setTo(initial?.to ?? "");
    setCc(initial?.cc ?? "");
    setShowCc(!!initial?.cc);
    setSubject(initial?.subject ?? "");
    setMinimized(false);
    setAttachments([]);
    setScheduleOpen(false);
    setScheduleAt("");
    setCountdown(null);
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = initial?.html ?? "";
      if (initial?.focusBody) editorRef.current?.focus();
    }, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Undo-send countdown tick. Must stay ABOVE the early return (Rules of Hooks).
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { setCountdown(null); doSend(); return; }
    const id = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  if (!open) return null;

  const exec = (cmd: string, value?: string) => { document.execCommand(cmd, false, value); editorRef.current?.focus(); };

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      // FileReader handles any size; the old String.fromCharCode(...Uint8Array)
      // overflowed the call stack for files larger than ~64 KB.
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(((reader.result as string).split(",")[1]) ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      next.push({ filename: file.name, contentBase64: b64, contentType: file.type || "application/octet-stream" });
    }
    setAttachments((a) => [...a, ...next]);
  }

  async function insertSignature() {
    const s = await wmGetFullSettings().catch(() => null);
    if (s?.signatureHtml && editorRef.current) editorRef.current.innerHTML += `<br/><br/>${s.signatureHtml}`;
    else toast.info("No signature set yet — add one in Settings → Signatures.");
  }

  function insertTemplate(html: string) {
    if (editorRef.current) editorRef.current.innerHTML += html;
  }

  async function runAi() {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const res = await aiDraft(aiPrompt.trim());
      if (res.subject && !subject) setSubject(res.subject);
      if (editorRef.current) editorRef.current.innerHTML = res.body;
      setAiOpen(false); setAiPrompt("");
      toast.success("Draft generated.");
    } catch (e) {
      toast.error(e instanceof WmError ? e.message : "AI draft failed.");
    } finally { setAiBusy(false); }
  }

  async function doSend(when?: string) {
    const toList = to.split(",").map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0) return toast.error("Add at least one recipient.");
    if (when && new Date(when).getTime() <= Date.now()) return toast.error("Pick a future time to schedule.");
    setSending(true);
    try {
      const res = await wmSend({
        to: toList,
        cc: cc.split(",").map((s) => s.trim()).filter(Boolean),
        bcc: bcc.split(",").map((s) => s.trim()).filter(Boolean),
        subject,
        html: editorRef.current?.innerHTML ?? "",
        attachments,
        ...(when ? { scheduledAt: new Date(when).toISOString() } : {}),
      });
      toast.success(res.scheduled ? `Scheduled for ${new Date(res.scheduledAt!).toLocaleString()}.` : "Message sent.");
      onClose();
    } catch (e) {
      toast.error(e instanceof WmError ? e.message : "Send failed.");
    } finally { setSending(false); }
  }

  // Undo Send: clicking Send starts a short countdown before the message actually goes
  // out, so it can be canceled. Scheduled sends skip the countdown.
  const UNDO_SECS = 6;
  function handleSend(when?: string) {
    if (when) return doSend(when);
    const toList = to.split(",").map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0) return toast.error("Add at least one recipient.");
    setCountdown(UNDO_SECS);
  }

  function confirmSchedule() {
    if (!scheduleAt) return toast.error("Choose a date and time.");
    setScheduleOpen(false);
    handleSend(scheduleAt);
  }

  // Closing a non-empty composer asks whether to keep it as a draft.
  function isDirty() {
    const body = (editorRef.current?.innerHTML ?? "").replace(/<br\s*\/?>/gi, "").replace(/<[^>]+>/g, "").trim();
    return !!(to.trim() || cc.trim() || bcc.trim() || subject.trim() || body || attachments.length);
  }
  function requestClose() {
    if (isDirty()) setClosePrompt(true);
    else onClose();
  }
  async function saveAsDraft() {
    setClosePrompt(false);
    try {
      await wmSaveDraft({
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        cc: cc.split(",").map((s) => s.trim()).filter(Boolean),
        bcc: bcc.split(",").map((s) => s.trim()).filter(Boolean),
        subject,
        html: editorRef.current?.innerHTML ?? "",
        attachments,
      });
      toast.success("Saved to Drafts.");
    } catch (e) {
      toast.error(e instanceof WmError ? e.message : "Could not save draft.");
    }
    onClose();
  }

  const ToolBtn = ({ icon: Icon, label, onClick, active }: { icon: typeof Bold; label: string; onClick: () => void; active?: boolean }) => (
    <button type="button" onClick={onClick} title={label} className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-elevated", active ? "text-primary" : "text-text-secondary")}>
      <Icon className="h-4 w-4" /> <span className="hidden xl:inline">{label}</span>
    </button>
  );

  return (
    <div
      style={!maximized && !minimized ? { width: size.w, height: size.h } : undefined}
      className={cn(
        "fixed z-50 flex flex-col rounded-lg border border-border bg-surface shadow-2xl",
        maximized ? "inset-6" : "bottom-0 right-6",
        minimized && "!h-12 !w-80",
      )}
    >
      {!maximized && !minimized && (
        <div
          onMouseDown={startResize}
          title="Drag to resize"
          className="absolute left-0 top-0 z-20 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-tl-lg text-surface/70 hover:text-surface"
        >
          <Maximize2 className="h-3.5 w-3.5 -scale-x-100" />
        </div>
      )}
      <div className="flex items-center justify-between rounded-t-lg bg-text-primary px-4 py-2 text-surface">
        <span className="text-sm font-medium">{subject || "New message"}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setMinimized((v) => !v)} aria-label="Minimize"><Minus className="h-4 w-4" /></button>
          <button onClick={() => setMaximized((v) => !v)} aria-label="Maximize"><Maximize2 className="h-4 w-4" /></button>
          <button onClick={requestClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {!minimized && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-1 border-b border-border px-4 py-2 text-sm">
            <div className="text-text-secondary">From: <span className="text-text-primary">{fromEmail}</span></div>
            <div className="flex items-center gap-2">
              <RecipientInput placeholder="To" value={to} onChange={setTo} />
              {!showCc && <button onClick={() => setShowCc(true)} className="text-xs text-primary">Cc/Bcc</button>}
            </div>
            {showCc && (
              <>
                <RecipientInput placeholder="Cc" value={cc} onChange={setCc} />
                <RecipientInput placeholder="Bcc" value={bcc} onChange={setBcc} />
              </>
            )}
            <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 border-0 px-0 font-medium focus-visible:ring-0" />
          </div>

          <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1.5">
            <ToolBtn icon={MousePointerClick} label="Track" onClick={() => { setTrack((v) => !v); toast.info(track ? "Tracking off" : "Read tracking on"); }} active={track} />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-elevated"><Palette className="h-4 w-4" /> <span className="hidden xl:inline">Design</span></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="z-[60] w-56 rounded-md border border-border bg-surface p-1 shadow-md" sideOffset={4}>
                  <div className="px-2 py-1 text-xs font-semibold text-text-secondary">Email body templates</div>
                  {DESIGN_TEMPLATES.map((t) => (
                    <DropdownMenu.Item key={t.label} onSelect={() => insertTemplate(t.html)} className="cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-elevated">{t.label}</DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <ToolBtn icon={Sparkles} label="AI Write" onClick={() => setAiOpen((v) => !v)} active={aiOpen} />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-elevated"><FileText className="h-4 w-4" /> <span className="hidden xl:inline">Templates</span></button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="z-[60] w-56 rounded-md border border-border bg-surface p-1 shadow-md" sideOffset={4}>
                  {[
                    { label: "Insert signature", run: insertSignature },
                    { label: "Meeting request", run: () => insertTemplate("<p>Hi,</p><p>Could we set up a short meeting this week?</p>") },
                    { label: "Thank you", run: () => insertTemplate("<p>Hi,</p><p>Thank you for your message — much appreciated.</p>") },
                    { label: "Follow-up", run: () => insertTemplate("<p>Hi,</p><p>Just following up on my previous email.</p>") },
                  ].map((t) => (
                    <DropdownMenu.Item key={t.label} onSelect={() => t.run()} className="cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-elevated">{t.label}</DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <ToolBtn icon={Users} label="Groups" onClick={() => navigate("/webmail/contacts")} />
          </div>

          {aiOpen && (
            <div className="flex items-end gap-2 border-b border-border bg-elevated px-3 py-2">
              <Input placeholder="Describe the email to write…" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAi()} autoFocus className="h-8" />
              <Button size="sm" onClick={runAi} loading={aiBusy}><Sparkles className="h-4 w-4" /> Generate</Button>
            </div>
          )}

          <div ref={editorRef} contentEditable suppressContentEditableWarning className="min-h-[12rem] flex-1 overflow-auto px-4 py-3 text-sm focus:outline-none" />

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pb-2">
              {attachments.map((a, i) => (
                <span key={i} className="flex items-center gap-1 rounded-md bg-elevated px-2 py-1 text-xs">
                  {a.filename}
                  <button onClick={() => setAttachments((l) => l.filter((_, j) => j !== i))} aria-label="Remove"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1 border-t border-border px-3 py-1.5 text-text-secondary">
            <select onChange={(e) => exec("fontName", e.target.value)} className="h-7 rounded border border-border bg-surface px-1 text-xs" defaultValue="">
              <option value="" disabled>Font</option><option value="Arial">Sans Serif</option><option value="Georgia">Serif</option><option value="Courier New">Mono</option>
            </select>
            <select onChange={(e) => exec("fontSize", e.target.value)} className="h-7 rounded border border-border bg-surface px-1 text-xs" defaultValue="3">
              <option value="2">Small</option><option value="3">Normal</option><option value="5">Large</option><option value="6">Huge</option>
            </select>
            <button onClick={() => exec("bold")} title="Bold" className="rounded p-1.5 hover:bg-elevated"><Bold className="h-4 w-4" /></button>
            <button onClick={() => exec("italic")} title="Italic" className="rounded p-1.5 hover:bg-elevated"><Italic className="h-4 w-4" /></button>
            <button onClick={() => exec("underline")} title="Underline" className="rounded p-1.5 hover:bg-elevated"><Underline className="h-4 w-4" /></button>
            <label title="Text color" className="cursor-pointer rounded p-1.5 hover:bg-elevated"><Palette className="h-4 w-4" /><input type="color" className="hidden" onChange={(e) => exec("foreColor", e.target.value)} /></label>
            <button onClick={() => exec("justifyLeft")} title="Align" className="rounded p-1.5 hover:bg-elevated"><AlignLeft className="h-4 w-4" /></button>
            <button onClick={() => exec("insertUnorderedList")} title="Bullets" className="rounded p-1.5 hover:bg-elevated"><List className="h-4 w-4" /></button>
            <button onClick={() => exec("insertOrderedList")} title="Numbered" className="rounded p-1.5 hover:bg-elevated"><ListOrdered className="h-4 w-4" /></button>
            <button onClick={() => { const u = prompt("Link URL"); if (u) exec("createLink", u); }} title="Link" className="rounded p-1.5 hover:bg-elevated"><Link2 className="h-4 w-4" /></button>
          </div>

          {countdown !== null && (
            <div className="flex items-center gap-3 border-t border-border bg-primary/10 px-3 py-2 text-sm">
              <Send className="h-4 w-4 text-primary" />
              <span className="flex-1">Sending in {countdown}s…</span>
              <Button size="sm" variant="ghost" onClick={() => setCountdown(null)}>Undo</Button>
              <Button size="sm" onClick={() => { setCountdown(null); doSend(); }}>Send now</Button>
            </div>
          )}

          {scheduleOpen && (
            <div className="flex flex-wrap items-end gap-2 border-t border-border bg-elevated px-3 py-2">
              <div className="flex flex-col">
                <label className="text-xs text-text-secondary">Send at</label>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
                />
              </div>
              <Button size="sm" onClick={confirmSchedule} loading={sending}><Clock className="h-4 w-4" /> Schedule</Button>
              <Button size="sm" variant="ghost" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            </div>
          )}

          <div className="flex items-center gap-1 border-t border-border px-3 py-2">
            <div className="flex">
              <Button onClick={() => handleSend()} loading={sending} className="rounded-r-none"><Send className="h-4 w-4" /> Send</Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button className="rounded-l-none border-l border-white/20 px-2"><ChevronDown className="h-4 w-4" /></Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="z-[60] w-44 rounded-md border border-border bg-surface p-1 shadow-md" sideOffset={4}>
                    <DropdownMenu.Item onSelect={() => handleSend()} className="cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-elevated">Send now</DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => setScheduleOpen(true)} className="cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-elevated">Schedule send…</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
            <button onClick={() => navigate("/webmail/campaigns")} title="Campaign" className="rounded p-2 text-secondary hover:bg-elevated"><Sparkles className="h-4 w-4" /></button>
            <button onClick={() => setScheduleOpen((v) => !v)} title="Schedule send" className={cn("rounded p-2 hover:bg-elevated", scheduleOpen && "text-primary")}><Clock className="h-4 w-4" /></button>
            <label title="Attach" className="cursor-pointer rounded p-2 hover:bg-elevated"><Paperclip className="h-4 w-4" /><input type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} /></label>
            <button onClick={() => { const u = prompt("Image URL"); if (u) exec("insertImage", u); }} title="Insert image" className="rounded p-2 hover:bg-elevated"><ImageIcon className="h-4 w-4" /></button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><button title="Emoji" className="rounded p-2 hover:bg-elevated"><Smile className="h-4 w-4" /></button></DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="z-[60] grid w-48 grid-cols-6 gap-1 rounded-md border border-border bg-surface p-2 shadow-md" sideOffset={4}>
                  {EMOJIS.map((e) => <button key={e} onClick={() => exec("insertText", e)} className="rounded p-1 text-lg hover:bg-elevated">{e}</button>)}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button onClick={insertSignature} title="Insert signature" className="rounded p-2 hover:bg-elevated"><PenLine className="h-4 w-4" /></button>
            <button onClick={onClose} title="Discard" className="ml-auto rounded p-2 text-text-secondary hover:bg-elevated hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {closePrompt && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-black/50 p-4" onClick={() => setClosePrompt(false)}>
          <div className="w-full max-w-xs rounded-lg border border-border bg-surface p-4 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-sm">Save this message to Drafts?</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={saveAsDraft}>Save draft</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={onClose}>Discard</Button>
              <Button size="sm" variant="ghost" onClick={() => setClosePrompt(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Recipient field with autocomplete from saved/used contacts (comma-separated). */
function RecipientInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { data: contacts } = useQuery({ queryKey: ["wm", "contacts"], queryFn: wmContacts, staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  const tokens = value.split(",");
  const current = (tokens[tokens.length - 1] ?? "").trim().toLowerCase();
  const chosen = new Set(tokens.slice(0, -1).map((t) => t.trim().toLowerCase()));
  const suggestions =
    current.length >= 1
      ? (contacts ?? [])
          .flatMap((c) => c.emails.map((e) => ({ name: c.name, email: e })))
          .filter((s) => !chosen.has(s.email.toLowerCase()) && (s.email.toLowerCase().includes(current) || (s.name ?? "").toLowerCase().includes(current)))
          .slice(0, 6)
      : [];

  function pick(email: string) {
    const before = tokens.slice(0, -1).map((t) => t.trim()).filter(Boolean);
    onChange([...before, email].join(", ") + ", ");
    setOpen(false);
  }

  return (
    <div className="relative flex-1">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-8 border-0 px-0 focus-visible:ring-0"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 top-9 z-[60] max-h-60 w-full max-w-sm overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.email}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(s.email); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-elevated"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {(s.name || s.email).charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm">{s.name || s.email}</span>
                {s.name && <span className="block truncate text-xs text-text-secondary">{s.email}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

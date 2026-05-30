import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox as InboxIcon, Send, FileText, Trash2, Folder as FolderIcon, Paperclip, Star, Search, FolderPlus, StickyNote, Play, X, Archive, MailOpen, ShieldAlert, Ban, FolderInput, Reply, ReplyAll, Forward, Sparkles, Clock, Tag } from "lucide-react";
import {
  wmFolders,
  wmFolderCounts,
  wmMessages,
  wmMessage,
  wmTrash,
  wmFlag,
  wmMove,
  wmCreateFolder,
  wmDeleteFolder,
  wmApplyRules,
  wmBlockSender,
  wmScheduled,
  wmCancelScheduled,
  aiReply,
  aiSummarize,
  attachmentUrl,
  type Folder,
  type MessageListItem,
  type MessageFull,
} from "./api";
import { Compose, type ComposeInitial } from "./Compose";
import { NotesPanel } from "./NotesPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { formatRelative, formatBytes } from "@/lib/format";
import { toast } from "@/components/ui/toast";

// Standard folders shown in the sidebar regardless of what the IMAP server reports.
// `kind` distinguishes real IMAP folders from virtual views (Starred = flagged, Scheduled).
const STANDARD = [
  { key: "INBOX", label: "Inbox", Icon: InboxIcon, kind: "folder", path: "INBOX" },
  { key: "starred", label: "Starred", Icon: Star, kind: "starred" },
  { key: "Sent", label: "Sent", Icon: Send, kind: "folder", path: "Sent" },
  { key: "Spam", label: "Spam", Icon: ShieldAlert, kind: "folder", path: "Junk" },
  { key: "Archive", label: "Archive", Icon: Archive, kind: "folder", path: "Archive" },
  { key: "Trash", label: "Trash", Icon: Trash2, kind: "folder", path: "Trash" },
  { key: "Scheduled", label: "Scheduled", Icon: Clock, kind: "scheduled" },
  { key: "Drafts", label: "Drafts", Icon: FileText, kind: "folder", path: "Drafts" },
  { key: "Important", label: "Important", Icon: Tag, kind: "folder", path: "Important" },
] as const;

const STD_PATHS = new Set(["INBOX", "Sent", "Junk", "Archive", "Trash", "Drafts", "Important"]);
const STD_USE = new Set(["\\Sent", "\\Drafts", "\\Trash", "\\Junk", "\\Inbox", "\\Archive"]);

/** Is this IMAP folder a custom (user-created) one, not a standard mailbox? */
const isCustomFolder = (f: Folder) =>
  !STD_PATHS.has(f.path) && !STD_USE.has(f.specialUse ?? "") && f.path.toUpperCase() !== "INBOX";

export function Inbox() {
  const qc = useQueryClient();
  const [folder, setFolder] = useState("INBOX");
  const [uid, setUid] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState<{ open: boolean; initial?: ComposeInitial }>({ open: false });
  const [showNotes, setShowNotes] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "starred">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [nav, setNav] = useState<string>("INBOX");

  function selectStd(item: (typeof STANDARD)[number]) {
    setUid(null); setSummary(null); setNav(item.key); setSelected(new Set());
    if (item.kind === "starred") { setFolder("INBOX"); setFilter("starred"); }
    else if (item.kind === "scheduled") { setFilter("all"); }
    else { setFolder(item.path); setFilter("all"); }
  }

  function toggleSel(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  async function bulk(action: "archive" | "delete" | "read") {
    for (const id of selected) {
      if (action === "archive") await wmMove(folder, id, folderByUse("\\Archive", "Archive")).catch(() => {});
      else if (action === "delete") await wmTrash(folder, id).catch(() => {});
      else await wmFlag(folder, id, { seen: true }).catch(() => {});
    }
    setSelected(new Set());
    refreshList();
    toast.success("Done.");
  }

  async function newFolder() {
    const name = prompt("New folder name");
    if (!name?.trim()) return;
    await wmCreateFolder(name.trim()).catch(() => toast.error("Could not create folder."));
    qc.invalidateQueries({ queryKey: ["wm", "folders"] });
    toast.success("Folder created.");
  }

  async function removeFolder(path: string) {
    if (!confirm(`Delete folder "${path}"? Messages in it will be lost.`)) return;
    await wmDeleteFolder(path).catch(() => toast.error("Could not delete folder."));
    if (folder === path) setFolder("INBOX");
    qc.invalidateQueries({ queryKey: ["wm", "folders"] });
  }

  async function runRules() {
    const r = await wmApplyRules("INBOX").catch(() => null);
    if (r) {
      qc.invalidateQueries({ queryKey: ["wm", "messages"] });
      toast.success(`Rules applied — ${r.moved} moved.`);
    }
  }

  const folders = useQuery({ queryKey: ["wm", "folders"], queryFn: wmFolders });
  const counts = useQuery({ queryKey: ["wm", "counts"], queryFn: wmFolderCounts, refetchInterval: 30_000 });
  const messages = useQuery({ queryKey: ["wm", "messages", folder, search], queryFn: () => wmMessages(folder, 1, search || undefined) });
  const scheduled = useQuery({ queryKey: ["wm", "scheduled"], queryFn: wmScheduled });

  // Unread count for a standard sidebar item (handles the Starred virtual folder).
  const unreadFor = (item: (typeof STANDARD)[number]): number => {
    if (item.kind === "starred") return 0;
    if (item.kind === "scheduled") return (scheduled.data ?? []).length;
    return counts.data?.[(item as { path: string }).path]?.unread ?? 0;
  };

  async function cancelScheduled(id: string) {
    await wmCancelScheduled(id).catch(() => toast.error("Could not cancel."));
    qc.invalidateQueries({ queryKey: ["wm", "scheduled"] });
    toast.success("Scheduled email canceled.");
  }
  const message = useQuery({ queryKey: ["wm", "message", folder, uid], queryFn: () => wmMessage(folder, uid!), enabled: uid !== null });

  // Reading a message marks it seen on the server — refresh unread badges + list dots.
  useEffect(() => {
    if (!message.data) return;
    qc.invalidateQueries({ queryKey: ["wm", "counts"] });
    qc.invalidateQueries({ queryKey: ["wm", "messages", folder] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.data?.uid]);

  function refreshList() {
    qc.invalidateQueries({ queryKey: ["wm", "messages", folder] });
    qc.invalidateQueries({ queryKey: ["wm", "counts"] });
  }

  async function onTrash(m: MessageListItem) {
    await wmTrash(folder, m.uid);
    if (uid === m.uid) setUid(null);
    refreshList();
    toast.success("Moved to Trash.");
  }

  const folderByUse = (use: string, fallback: string) => folders.data?.find((f) => f.specialUse === use)?.path ?? fallback;

  async function moveTo(target: string) {
    if (uid === null || !target) return;
    await wmMove(folder, uid, target).then(() => { setUid(null); refreshList(); toast.success(`Moved to ${target}.`); }).catch(() => toast.error("Move failed (needs IMAP server)."));
  }
  async function markUnread() {
    if (uid === null) return;
    await wmFlag(folder, uid, { seen: false }).then(() => { refreshList(); toast.success("Marked unread."); }).catch(() => toast.error("Failed."));
  }
  async function blockSender() {
    const addr = message.data?.from[0]?.address;
    if (!addr) return;
    await wmBlockSender(addr).then(() => toast.success(`Blocked ${addr}.`)).catch(() => toast.error("Failed."));
  }

  function plainText(m: MessageFull): string {
    return m.text ?? m.html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
  }
  function quote(m: MessageFull): string {
    const who = m.from[0]?.name || m.from[0]?.address || "sender";
    return `<br/><br/><blockquote style="border-left:2px solid #ccc;margin:0;padding-left:10px;color:#666">On ${new Date(m.date ?? Date.now()).toLocaleString()}, ${who} wrote:<br/>${m.html ?? m.text ?? ""}</blockquote>`;
  }
  const reSubj = (s: string) => (/^re:/i.test(s) ? s : `Re: ${s}`);
  const fwdSubj = (s: string) => (/^fwd:/i.test(s) ? s : `Fwd: ${s}`);

  function reply() {
    const m = message.data!; const from = m.from[0]?.address ?? "";
    setCompose({ open: true, initial: { to: from, subject: reSubj(m.subject), html: quote(m), focusBody: true } });
  }
  function replyAll() {
    const m = message.data!; const from = m.from[0]?.address ?? "";
    const others = [...m.to, ...m.cc].map((a) => a.address).filter((a) => a && a !== from);
    setCompose({ open: true, initial: { to: [from, ...others].filter(Boolean).join(", "), subject: reSubj(m.subject), html: quote(m), focusBody: true } });
  }
  function forward() {
    const m = message.data!;
    setCompose({ open: true, initial: { subject: fwdSubj(m.subject), html: quote(m), focusBody: true } });
  }
  async function replyWithAi() {
    const m = message.data!; const from = m.from[0]?.address ?? "";
    const res = await aiReply(plainText(m)).catch((e) => { toast.error(e instanceof Error ? e.message : "AI failed."); return null; });
    if (!res) return;
    setCompose({ open: true, initial: { to: from, subject: reSubj(m.subject), html: `${res.body}${quote(m)}`, focusBody: true } });
  }
  async function summarize() {
    if (!message.data) return;
    setSummaryBusy(true); setSummary(null);
    const res = await aiSummarize(plainText(message.data)).catch((e) => { toast.error(e instanceof Error ? e.message : "AI failed."); return null; });
    setSummaryBusy(false);
    if (res) setSummary(res.summary);
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Folders */}
      <aside className="flex w-48 shrink-0 flex-col border-r border-border p-3">
        <Button className="mb-2 w-full" onClick={() => setCompose({ open: true })}>New email</Button>
        <div className="mb-2 flex gap-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={newFolder}><FolderPlus className="h-4 w-4" /> Folder</Button>
          <Button variant="outline" size="sm" onClick={runRules} title="Run inbox rules"><Play className="h-4 w-4" /></Button>
        </div>
        <nav className="space-y-0.5 overflow-auto">
          {STANDARD.map((item) => {
            const unread = unreadFor(item);
            return (
              <button
                key={item.key}
                onClick={() => selectStd(item)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  nav === item.key ? "bg-primary/15 font-medium text-primary" : "text-text-secondary hover:bg-elevated",
                )}
              >
                <item.Icon className="h-4 w-4 shrink-0" />
                <span className={cn("truncate", unread > 0 && "font-semibold text-text-primary")}>{item.label}</span>
                {unread > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{unread}</span>
                )}
              </button>
            );
          })}

          {/* Custom folders */}
          {(folders.data ?? []).some(isCustomFolder) && (
            <div className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Folders</div>
          )}
          {(folders.data ?? []).filter(isCustomFolder).map((f) => (
            <div
              key={f.path}
              className={cn(
                "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                nav === f.path ? "bg-primary/15 text-primary" : "text-text-secondary hover:bg-elevated",
              )}
            >
              <button onClick={() => { setFolder(f.path); setNav(f.path); setFilter("all"); setUid(null); }} className="flex min-w-0 flex-1 items-center gap-2">
                <FolderIcon className="h-4 w-4 shrink-0" /> <span className="truncate">{f.name}</span>
                {(counts.data?.[f.path]?.unread ?? 0) > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{counts.data![f.path]!.unread}</span>
                )}
              </button>
              <button onClick={() => removeFolder(f.path)} className="hidden text-text-secondary hover:text-danger group-hover:block" aria-label="Delete folder">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </nav>
      </aside>

      {/* Message list */}
      <div className="flex w-96 shrink-0 flex-col border-r border-border">
        <div className="space-y-2 border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input placeholder="Search mail…" className="h-9 pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-semibold">{STANDARD.find((s) => s.key === nav)?.label ?? folders.data?.find((f) => f.path === folder)?.name ?? folder}</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-7 rounded-md border border-border bg-surface px-2 text-xs">
              <option value="all">All emails</option>
              <option value="unread">Unread</option>
              <option value="starred">Starred</option>
            </select>
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs">
              <span className="mr-auto text-primary">{selected.size} selected</span>
              <button onClick={() => bulk("read")} className="rounded px-1.5 py-1 hover:bg-elevated" title="Mark read"><MailOpen className="h-4 w-4" /></button>
              <button onClick={() => bulk("archive")} className="rounded px-1.5 py-1 hover:bg-elevated" title="Archive"><Archive className="h-4 w-4" /></button>
              <button onClick={() => bulk("delete")} className="rounded px-1.5 py-1 text-danger hover:bg-elevated" title="Delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {nav === "scheduled" ? (
            scheduled.isLoading ? (
              <div className="p-8 text-center"><Spinner className="mx-auto" /></div>
            ) : (scheduled.data ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm text-text-secondary"><Clock className="mx-auto mb-2 h-6 w-6" />No scheduled emails. Use the schedule option in Compose.</div>
            ) : (
              (scheduled.data ?? []).map((s) => (
                <div key={s.id} className="group flex items-start gap-2 border-b border-border px-3 py-2.5">
                  <Clock className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm font-medium">To: {s.to.join(", ")}</span>
                      <button onClick={() => cancelScheduled(s.id)} className="hidden text-text-secondary hover:text-danger group-hover:block" title="Cancel"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="truncate text-sm">{s.subject || "(no subject)"}</div>
                    <div className="text-xs text-primary">Sends {new Date(s.scheduledAt).toLocaleString()}</div>
                  </div>
                </div>
              ))
            )
          ) : messages.isLoading ? (
            <div className="p-8 text-center"><Spinner className="mx-auto" /></div>
          ) : (() => {
            const visible = (messages.data?.items ?? []).filter((m) => filter === "unread" ? !m.seen : filter === "starred" ? m.flagged : true);
            if (visible.length === 0) return <p className="p-8 text-center text-sm text-text-secondary">No messages.</p>;
            return visible.map((m) => (
              <div
                key={m.uid}
                onClick={() => { setUid(m.uid); setSummary(null); }}
                className={cn(
                  "group flex w-full cursor-pointer items-start gap-2 border-b border-border px-3 py-2.5 hover:bg-elevated",
                  uid === m.uid && "bg-elevated",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.uid)}
                  onClick={(e) => toggleSel(m.uid, e)}
                  onChange={() => undefined}
                  className="mt-1 accent-primary"
                />
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", m.seen ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className={cn("truncate text-sm", !m.seen && "font-semibold")}>{m.from[0]?.name || m.from[0]?.address || "Unknown"}</span>
                    <span className="shrink-0 text-xs text-text-secondary">{formatRelative(m.date)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {m.flagged && <Star className="h-3 w-3 shrink-0 text-warning" />}
                    {m.hasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-text-secondary" />}
                    <span className={cn("truncate text-sm", !m.seen && "font-medium")}>{m.subject}</span>
                  </div>
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Reading pane + notes */}
      <div className="flex min-w-0 flex-1">
       <div className="min-w-0 flex-1 overflow-auto">
        {!uid ? (
          <div className="flex h-full items-center justify-center text-sm text-text-secondary">Select a message to read</div>
        ) : message.isLoading || !message.data ? (
          <div className="p-8"><Spinner /></div>
        ) : (
          <>
          {/* Titan-style action toolbar */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-border bg-surface px-4 py-2">
            <ToolbarBtn icon={Archive} label="Archive" onClick={() => moveTo(folderByUse("\\Archive", "Archive"))} />
            <ToolbarBtn icon={Trash2} label="Delete" onClick={() => onTrash(message.data!)} danger />
            <ToolbarBtn icon={message.data.flagged ? Star : Star} label="Star" onClick={() => wmFlag(folder, uid, { flagged: !message.data!.flagged }).then(refreshList)} active={message.data.flagged} />
            <ToolbarBtn icon={MailOpen} label="Mark unread" onClick={markUnread} />
            <ToolbarBtn icon={ShieldAlert} label="Spam" onClick={() => moveTo(folderByUse("\\Junk", "Junk"))} />
            <ToolbarBtn icon={Ban} label="Block" onClick={blockSender} />
            <ToolbarBtn icon={StickyNote} label="Notes" onClick={() => setShowNotes((v) => !v)} active={showNotes} />
            <div className="flex items-center gap-1">
              <FolderInput className="h-4 w-4 text-text-secondary" />
              <select
                value=""
                onChange={(e) => e.target.value && moveTo(e.target.value)}
                className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text-secondary"
              >
                <option value="">Move to…</option>
                {folders.data?.filter((f) => f.path !== folder).map((f) => <option key={f.path} value={f.path}>{f.name}</option>)}
              </select>
            </div>
            <button onClick={summarize} className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-elevated">
              <FileText className="h-4 w-4" /> AI Summary
            </button>
          </div>
          <article className="mx-auto max-w-3xl p-6">
            <header className="mb-4 border-b border-border pb-4">
              <h1 className="mb-2 text-xl font-semibold">{message.data.subject}</h1>
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span className="font-medium text-text-primary">{message.data.from[0]?.name || message.data.from[0]?.address}</span>
                <span>&lt;{message.data.from[0]?.address}&gt;</span>
              </div>
            </header>

            {(summaryBusy || summary) && (
              <div className="mb-4 rounded-md border border-secondary/40 bg-secondary/5 p-3 text-sm">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-secondary"><Sparkles className="h-4 w-4" /> AI Summary</div>
                {summaryBusy ? <span className="text-text-secondary">Summarizing…</span> : <div className="whitespace-pre-wrap text-text-primary">{summary}</div>}
              </div>
            )}

            {message.data.attachments.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {message.data.attachments.map((a) => (
                  <a key={a.index} href={attachmentUrl(folder, uid, a.index)} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-elevated">
                    <Paperclip className="h-3 w-3" /> {a.filename} <span className="text-text-secondary">({formatBytes(a.size)})</span>
                  </a>
                ))}
              </div>
            )}

            {/* Sandboxed iframe blocks scripts; image-load is up to the browser. */}
            {message.data.html ? (
              <iframe title="message" sandbox="" className="h-[60vh] w-full rounded-md border border-border bg-white" srcDoc={message.data.html} />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm">{message.data.text}</pre>
            )}

            {/* Quick replies */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button variant="outline" size="sm" onClick={reply}><Reply className="h-4 w-4" /> Reply</Button>
              <Button variant="outline" size="sm" onClick={replyAll}><ReplyAll className="h-4 w-4" /> Reply all</Button>
              <Button variant="outline" size="sm" onClick={forward}><Forward className="h-4 w-4" /> Forward</Button>
              <Button variant="secondary" size="sm" onClick={replyWithAi} className="ml-auto"><Sparkles className="h-4 w-4" /> Reply with AI</Button>
            </div>
          </article>
          </>
        )}
       </div>
       {showNotes && uid && message.data && (
         <aside className="w-72 shrink-0 border-l border-border">
           <NotesPanel messageId={message.data.messageId} />
         </aside>
       )}
      </div>

      <Compose open={compose.open} initial={compose.initial} onClose={() => { setCompose({ open: false }); refreshList(); qc.invalidateQueries({ queryKey: ["wm", "scheduled"] }); }} />
    </div>
  );
}

function ToolbarBtn({ icon: Icon, label, onClick, danger, active }: { icon: typeof Archive; label: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-elevated",
        active ? "text-primary" : danger ? "text-text-secondary hover:text-danger" : "text-text-secondary hover:text-text-primary",
      )}
    >
      <Icon className={cn("h-4 w-4", active && "fill-current")} /> <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

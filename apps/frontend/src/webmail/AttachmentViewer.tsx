import { useEffect, useState } from "react";
import { X, Download, ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import { attachmentUrl } from "./api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface ViewerAttachment {
  index: number;
  filename: string;
  contentType: string;
  size: number;
}

type Kind = "pdf" | "image" | "text" | "csv" | "html" | "other";

function kindOf(a: ViewerAttachment): Kind {
  const ct = (a.contentType || "").toLowerCase();
  const ext = a.filename.toLowerCase().split(".").pop() ?? "";
  if (ct.includes("pdf") || ext === "pdf") return "pdf";
  if (ct.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";
  if (ext === "csv" || ct === "text/csv") return "csv";
  if (ct.startsWith("text/html") || ext === "html" || ext === "htm") return "html";
  if (ct.startsWith("text/") || ["txt", "log", "md", "json", "xml", "yml", "yaml", "ini", "conf"].includes(ext)) return "text";
  return "other";
}

/** Full-screen modal previewer for email attachments (PDF, images, text/CSV). */
export function AttachmentViewer({
  folder,
  uid,
  attachments,
  startIndex,
  onClose,
}: {
  folder: string;
  uid: number;
  attachments: ViewerAttachment[];
  startIndex: number;
  onClose: () => void;
}) {
  const [pos, setPos] = useState(startIndex);
  const att = attachments[pos];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setPos((p) => Math.min(p + 1, attachments.length - 1));
      if (e.key === "ArrowLeft") setPos((p) => Math.max(p - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachments.length, onClose]);

  if (!att) return null;
  const url = attachmentUrl(folder, uid, att.index);
  const kind = kindOf(att);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/80 backdrop-blur-sm" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <FileText className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{att.filename}</div>
          <div className="text-xs text-white/60">{att.contentType || "file"} · {formatBytes(att.size)}</div>
        </div>
        {attachments.length > 1 && (
          <span className="text-xs text-white/70">{pos + 1} / {attachments.length}</span>
        )}
        <a href={url} download={att.filename} className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
          <Download className="h-4 w-4" /> Download
        </a>
        <button onClick={onClose} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {attachments.length > 1 && (
          <>
            <NavArrow side="left" disabled={pos === 0} onClick={() => setPos((p) => Math.max(p - 1, 0))} />
            <NavArrow side="right" disabled={pos === attachments.length - 1} onClick={() => setPos((p) => Math.min(p + 1, attachments.length - 1))} />
          </>
        )}

        {kind === "pdf" && (
          <iframe title={att.filename} src={url} className="h-full w-full max-w-5xl rounded-md bg-white" />
        )}
        {kind === "image" && (
          <img src={url} alt={att.filename} className="max-h-full max-w-full rounded-md object-contain shadow-2xl" />
        )}
        {(kind === "text" || kind === "csv" || kind === "html") && <TextPreview url={url} kind={kind} />}
        {kind === "other" && (
          <div className="rounded-lg bg-surface p-8 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-text-secondary" />
            <p className="mb-1 text-sm font-medium">No in-app preview for this file type</p>
            <p className="mb-4 text-xs text-text-secondary">{att.filename}</p>
            <a href={url} download={att.filename} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
              <Download className="h-4 w-4" /> Download to open
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function NavArrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-0",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}

function TextPreview({ url, kind }: { url: string; kind: "text" | "csv" | "html" }) {
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setContent(null); setErr(false);
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => alive && setContent(t))
      .catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [url]);

  if (err) return <div className="rounded-md bg-surface p-6 text-sm text-danger">Could not load file.</div>;
  if (content === null) return <Loader2 className="h-6 w-6 animate-spin text-white" />;

  if (kind === "csv") {
    const rows = content.trim().split(/\r?\n/).slice(0, 500).map((line) => line.split(","));
    return (
      <div className="h-full w-full max-w-5xl overflow-auto rounded-md bg-white p-2">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {rows.map((cells, r) => (
              <tr key={r} className={r === 0 ? "bg-elevated font-semibold" : ""}>
                {cells.map((c, i) => <td key={i} className="border border-border px-2 py-1 text-black">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (kind === "html") {
    return <iframe title="preview" sandbox="" srcDoc={content} className="h-full w-full max-w-5xl rounded-md bg-white" />;
  }
  return (
    <pre className="h-full w-full max-w-5xl overflow-auto rounded-md bg-white p-4 text-xs leading-relaxed text-black">{content}</pre>
  );
}

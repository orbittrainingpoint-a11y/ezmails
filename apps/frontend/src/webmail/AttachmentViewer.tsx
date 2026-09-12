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

type Kind = "pdf" | "image" | "text" | "csv" | "html" | "docx" | "xlsx" | "other";

function kindOf(a: ViewerAttachment): Kind {
  const ct = (a.contentType || "").toLowerCase();
  const ext = a.filename.toLowerCase().split(".").pop() ?? "";
  if (ct.includes("pdf") || ext === "pdf") return "pdf";
  if (ct.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";
  if (ext === "csv" || ct === "text/csv") return "csv";
  if (ext === "docx" || ct.includes("wordprocessingml")) return "docx";
  if (["xlsx", "xls"].includes(ext) || ct.includes("spreadsheetml") || ct.includes("ms-excel")) return "xlsx";
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
  const dlUrl = `${url}&download=1`;
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
        <a href={dlUrl} download={att.filename} className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
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
          <iframe title={att.filename} src={url} sandbox="" className="h-full w-full max-w-5xl rounded-md bg-white" />
        )}
        {kind === "image" && (
          <img src={url} alt={att.filename} className="max-h-full max-w-full rounded-md object-contain shadow-2xl" />
        )}
        {(kind === "text" || kind === "csv" || kind === "html") && <TextPreview url={url} kind={kind} />}
        {kind === "docx" && <DocxPreview url={url} filename={att.filename} />}
        {kind === "xlsx" && <SheetPreview url={url} filename={att.filename} />}
        {kind === "other" && (
          <div className="rounded-lg bg-surface p-8 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-text-secondary" />
            <p className="mb-1 text-sm font-medium">No in-app preview for this file type</p>
            <p className="mb-4 text-xs text-text-secondary">{att.filename}</p>
            <a href={dlUrl} download={att.filename} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
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

function Loading() {
  return <Loader2 className="h-6 w-6 animate-spin text-white" />;
}
function Failed({ url, filename }: { url: string; filename: string }) {
  return (
    <div className="rounded-lg bg-surface p-8 text-center">
      <FileText className="mx-auto mb-3 h-10 w-10 text-text-secondary" />
      <p className="mb-4 text-sm">Couldn’t render a preview. You can download it instead.</p>
      <a href={`${url}&download=1`} download={filename} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
        <Download className="h-4 w-4" /> Download
      </a>
    </div>
  );
}

/** Word (.docx) preview via mammoth (lazy-loaded). */
function DocxPreview({ url, filename }: { url: string; filename: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mammoth = await import("mammoth");
        const buf = await (await fetch(url, { credentials: "include" })).arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (alive) setHtml(result.value as string);
      } catch {
        if (alive) setErr(true);
      }
    })();
    return () => { alive = false; };
  }, [url]);

  if (err) return <Failed url={url} filename={filename} />;
  if (html === null) return <Loading />;
  // SEC: mammoth's output can carry attacker-controlled markup from the source
  // .docx — render it the same sandboxed way the plain-HTML attachment preview
  // already does (TextPreview's "html" branch), never dangerouslySetInnerHTML
  // in the main document.
  const styled = `<style>body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;padding:24px;color:#111}h1{font-size:1.25rem;font-weight:700;margin-bottom:.5rem}h2{font-size:1.1rem;font-weight:600;margin-bottom:.5rem}p{margin-bottom:.5rem}table{border-collapse:collapse}td{border:1px solid #d1d5db;padding:2px 8px}ul{list-style:disc;padding-left:1.5rem}</style>${html}`;
  return (
    <iframe
      title={filename}
      sandbox=""
      srcDoc={styled}
      className="h-full w-full max-w-3xl rounded-md bg-white"
    />
  );
}

/** Excel (.xlsx/.xls) preview via SheetJS (lazy-loaded), with sheet tabs. */
function SheetPreview({ url, filename }: { url: string; filename: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wb, setWb] = useState<any>(null);
  const [names, setNames] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [html, setHtml] = useState<string>("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const XLSX = await import("xlsx");
        const buf = await (await fetch(url, { credentials: "include" })).arrayBuffer();
        const book = XLSX.read(buf, { type: "array" });
        if (!alive) return;
        setWb(book);
        setNames(book.SheetNames);
      } catch {
        if (alive) setErr(true);
      }
    })();
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    const name = names[active];
    if (!wb || !name) return;
    (async () => {
      const XLSX = await import("xlsx");
      setHtml(XLSX.utils.sheet_to_html(wb.Sheets[name]));
    })();
  }, [wb, names, active]);

  if (err) return <Failed url={url} filename={filename} />;
  if (!wb) return <Loading />;
  return (
    <div className="flex h-full w-full max-w-5xl flex-col rounded-md bg-white">
      {names.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 p-1">
          {names.map((n, i) => (
            <button
              key={n}
              onClick={() => setActive(i)}
              className={cn("whitespace-nowrap rounded px-3 py-1 text-xs", i === active ? "bg-primary text-white" : "text-gray-700 hover:bg-gray-100")}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      {/* SEC: SheetJS's generated hyperlink markup doesn't escape cell/link content,
          so this is sandboxed the same way as DocxPreview/TextPreview's html
          branch — never rendered directly in the main document. */}
      <iframe
        title={filename}
        sandbox=""
        srcDoc={`<style>body{font-family:system-ui,sans-serif;font-size:12px;padding:8px;color:#111}table{border-collapse:collapse}td{border:1px solid #d1d5db;padding:2px 8px}</style>${html}`}
        className="flex-1 border-0"
      />
    </div>
  );
}

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PenTool, Check, Code2, Type, LayoutTemplate, Bold, Italic, Underline,
  List, Link2, RotateCcw, Copy, Eye,
} from "lucide-react";
import { wmSaveSettings } from "./api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

// ── Dynamic field model ──
export interface SigFields {
  name: string;
  title: string;
  company: string;
  department: string;
  phone: string;
  phone2: string;
  email: string;
  website: string;
  address: string;
  logoUrl: string;
  photoUrl: string;
  bannerUrl: string;
  bannerLink: string;
  linkedin: string;
  twitter: string;
  facebook: string;
  instagram: string;
  ctaText: string;
  ctaLink: string;
  disclaimer: string;
  accent: string;
  textColor: string;
}

const DEFAULTS: SigFields = {
  name: "Alex Morgan",
  title: "Head of Customer Success",
  company: "Northwind Co.",
  department: "",
  phone: "+1 (555) 123-4567",
  phone2: "",
  email: "alex@northwind.co",
  website: "www.northwind.co",
  address: "100 Market St, Suite 400, San Francisco, CA",
  logoUrl: "",
  photoUrl: "",
  bannerUrl: "",
  bannerLink: "",
  linkedin: "https://linkedin.com/in/alexmorgan",
  twitter: "",
  facebook: "",
  instagram: "",
  ctaText: "Book a meeting",
  ctaLink: "https://cal.com/alex",
  disclaimer: "",
  accent: "#114b43",
  textColor: "#333333",
};

// ── HTML builder helpers (email-safe inline styles) ──
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const norm = (u: string) =>
  !u ? "" : /^(https?:|mailto:|tel:|#)/i.test(u) ? u : `https://${u}`;
const A = (href: string, text: string, color: string) =>
  href ? `<a href="${norm(href)}" style="color:${color};text-decoration:none">${esc(text)}</a>` : "";
const mail = (f: SigFields) => (f.email ? A(`mailto:${f.email}`, f.email, f.accent) : "");
const web = (f: SigFields) => (f.website ? A(f.website, f.website.replace(/^https?:\/\//, ""), f.accent) : "");
const sub = (f: SigFields) => [f.title, f.company].filter(Boolean).map(esc).join(", ");

const photo = (f: SigFields, size = 80, radius = "50%") =>
  f.photoUrl
    ? `<img src="${f.photoUrl}" width="${size}" height="${size}" alt="" style="border-radius:${radius};border:2px solid ${f.accent};object-fit:cover;display:block"/>`
    : "";
const logoImg = (f: SigFields, size = 56) =>
  f.logoUrl ? `<img src="${f.logoUrl}" width="${size}" alt="" style="display:block"/>` : "";

const badge = (href: string, letter: string, accent: string) =>
  href
    ? `<a href="${norm(href)}" style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:${accent};color:#fff;border-radius:5px;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;text-decoration:none;margin-right:5px">${letter}</a>`
    : "";
const socials = (f: SigFields) =>
  [badge(f.linkedin, "in", f.accent), badge(f.twitter, "X", f.accent), badge(f.facebook, "f", f.accent), badge(f.instagram, "◉", f.accent)]
    .filter(Boolean)
    .join("");

const btn = (f: SigFields, full = false) =>
  f.ctaText && f.ctaLink
    ? `<a href="${norm(f.ctaLink)}" style="display:inline-block;background:${f.accent};color:#fff;padding:8px 18px;border-radius:5px;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;text-decoration:none${full ? ";width:100%;text-align:center;box-sizing:border-box" : ""}">${esc(f.ctaText)}</a>`
    : "";
const btnOutline = (f: SigFields) =>
  f.ctaText && f.ctaLink
    ? `<a href="${norm(f.ctaLink)}" style="display:inline-block;border:1px solid ${f.accent};color:${f.accent};padding:7px 22px;border-radius:16px;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;text-decoration:none">${esc(f.ctaText)}</a>`
    : "";
const banner = (f: SigFields, max = 460) =>
  f.bannerUrl
    ? `<a href="${norm(f.bannerLink || "#")}"><img src="${f.bannerUrl}" alt="" style="width:100%;max-width:${max}px;display:block;border:0"/></a>`
    : "";
const disc = (f: SigFields) =>
  f.disclaimer ? `<div style="font-size:9px;color:#999;line-height:1.4;margin-top:10px;max-width:460px">${esc(f.disclaimer)}</div>` : "";

const labeled = (f: SigFields, items: [string, string][]) =>
  items
    .filter(([, v]) => v)
    .map(([k, v]) => `<strong style="color:${f.accent}">${k}.</strong> ${v}`)
    .join("<br/>");

// ── Templates (15) inspired by the provided pro signature set ──
type Tpl = { id: string; name: string; build: (f: SigFields) => string };
const TEMPLATES: Tpl[] = [
  {
    id: "classic", name: "Classic Bar", build: (f) =>
      `<table style="font-family:Arial,sans-serif;border-collapse:collapse"><tr>${f.logoUrl ? `<td style="padding-right:14px;vertical-align:top">${logoImg(f)}</td>` : ""}<td style="border-left:3px solid ${f.accent};padding-left:14px">
        <div style="font-weight:700;font-size:15px;color:${f.textColor}">${esc(f.name)}</div>
        <div style="font-size:13px;color:#555">${sub(f)}</div>
        <div style="font-size:13px;color:#555;margin-top:4px">${[f.phone, web(f), mail(f)].filter(Boolean).join(" &nbsp;|&nbsp; ")}</div>
        ${socials(f) ? `<div style="margin-top:6px">${socials(f)}</div>` : ""}</td></tr></table>`,
  },
  {
    id: "photo-right", name: "Healthcare (photo right)", build: (f) =>
      `<table style="font-family:Arial,sans-serif;border-collapse:collapse;max-width:450px"><tr>
        <td style="vertical-align:top;padding-right:18px">
          <div style="font-weight:700;font-size:16px;color:${f.accent}">${esc(f.name)}</div>
          <div style="font-size:11px;color:#666;margin-top:2px">${esc(f.title)}</div>
          <div style="font-size:11px;color:#666;font-weight:bold">${esc(f.company)}</div>
          ${socials(f) ? `<div style="margin-top:8px">${socials(f)}</div>` : ""}
        </td>
        ${f.photoUrl ? `<td style="vertical-align:top">${photo(f, 80)}</td>` : ""}
      </tr>
      <tr><td colspan="2" style="border-top:1px solid ${f.accent};padding-top:8px;font-size:11px">
        <table width="100%"><tr><td>${f.phone ? `<strong>P.</strong> ${f.phone}` : ""}</td><td>${mail(f) ? `<strong>E.</strong> ${mail(f)}` : ""}</td></tr>
        <tr><td>${f.address ? `<strong>A.</strong> ${esc(f.address)}` : ""}</td><td>${web(f) ? `<strong>W.</strong> ${web(f)}` : ""}</td></tr></table>
      </td></tr>
      ${f.ctaText && f.ctaLink ? `<tr><td colspan="2" style="padding-top:12px;text-align:center">${btnOutline(f)}</td></tr>` : ""}</table>`,
  },
  {
    id: "centered-photo", name: "Centered + CTA", build: (f) =>
      `<table style="font-family:Arial,sans-serif;width:380px;text-align:center;border-collapse:collapse">
        ${f.photoUrl ? `<tr><td style="padding-bottom:8px">${photo(f, 75)}</td></tr>` : ""}
        <tr><td style="padding-bottom:8px;border-bottom:1px solid ${f.accent}">
          <div style="color:${f.accent};font-size:15px;font-weight:700">${esc(f.name)}</div>
          ${f.company ? `<div style="font-size:11px;color:#666;font-weight:bold">${esc(f.company)}</div>` : ""}
          ${f.title ? `<div style="font-size:11px;color:#888">${esc(f.title)}</div>` : ""}
        </td></tr>
        <tr><td style="padding-top:10px">
          <div style="font-size:11px;color:#555;line-height:1.7">${[f.phone, mail(f), web(f), f.address && esc(f.address)].filter(Boolean).join(" &nbsp;·&nbsp; ")}</div>
          ${f.ctaText && f.ctaLink ? `<div style="margin-top:12px">${btn(f, true)}</div>` : ""}
        </td></tr></table>`,
  },
  {
    id: "schedule", name: "Consultation (photo left)", build: (f) =>
      `<table style="font-family:Arial,sans-serif;max-width:460px;border-collapse:collapse"><tr>
        ${f.photoUrl ? `<td style="padding-right:15px;vertical-align:top">${photo(f, 90, "8px")}</td>` : ""}
        <td style="vertical-align:top">
          <div style="color:${f.accent};font-size:18px;font-weight:700">${esc(f.name)}</div>
          <div style="font-size:12px;color:#666;margin:2px 0 8px">${[f.company, f.title].filter(Boolean).map(esc).join(" · ")}</div>
          <div style="font-size:12px;line-height:1.5">${labeled(f, [["P", f.phone], ["E", mail(f)], ["W", web(f)]])}</div>
          ${socials(f) ? `<div style="margin-top:8px">${socials(f)}</div>` : ""}
        </td></tr>
        ${f.ctaText && f.ctaLink ? `<tr><td colspan="2" style="padding-top:12px">${btn(f, true)}</td></tr>` : ""}</table>`,
  },
  {
    id: "realestate", name: "Real Estate (solid CTA)", build: (f) =>
      `<table style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:460px;border-collapse:collapse"><tr>
        ${f.photoUrl ? `<td style="padding-right:15px;vertical-align:middle">${photo(f, 85)}</td>` : ""}
        <td style="vertical-align:middle">
          <span style="font-size:16px;font-weight:bold;color:${f.accent}">${esc(f.name)}</span><br/>
          <span style="font-size:12px;color:#444">${sub(f)}</span>
          <p style="margin:6px 0;font-size:12px;color:#555">${[f.phone, mail(f)].filter(Boolean).join(" • ")}<br/>${web(f)}</p>
          ${btn(f)}
        </td></tr></table>`,
  },
  {
    id: "legal-banner", name: "Legal (banner + disclaimer)", build: (f) =>
      `<table style="font-family:Arial,sans-serif;max-width:460px;border-collapse:collapse"><tr>
        ${f.photoUrl ? `<td style="padding-right:15px;vertical-align:top">${photo(f, 90, "6px")}</td>` : ""}
        <td style="vertical-align:top;border-left:2px solid ${f.accent};padding-left:15px">
          <div style="color:${f.accent};font-size:17px;font-weight:700">${esc(f.name)}</div>
          <div style="font-size:12px;font-weight:bold;margin:2px 0 8px">${esc(f.title)}${f.company ? `<br/><span style="font-weight:normal">${esc(f.company)}</span>` : ""}</div>
          <div style="font-size:12px">${labeled(f, [["P", f.phone], ["E", mail(f)]])}</div>
          ${socials(f) ? `<div style="margin-top:8px">${socials(f)}</div>` : ""}
        </td></tr>
        ${f.bannerUrl ? `<tr><td colspan="2" style="padding-top:12px">${banner(f)}</td></tr>` : ""}
        ${f.disclaimer ? `<tr><td colspan="2">${disc(f)}</td></tr>` : ""}</table>`,
  },
  {
    id: "designer-banner", name: "Designer (divider + banner)", build: (f) =>
      `<table style="font-family:Arial,sans-serif;max-width:460px;color:#2c3e50;border-collapse:collapse"><tr>
        <td style="vertical-align:middle;padding-right:15px">
          <div style="font-size:16px;font-weight:700">${esc(f.name)}</div>
          <div style="font-size:12px;color:#7f8c8d">${esc(f.title)}</div>
        </td>
        <td style="border-left:2px solid ${f.accent};padding-left:15px;font-size:12px;line-height:1.5">
          ${[f.phone, mail(f), web(f)].filter(Boolean).join("<br/>")}
        </td></tr>
        ${f.bannerUrl ? `<tr><td colspan="2" style="padding-top:12px">${banner(f)}</td></tr>` : ""}
        ${f.disclaimer ? `<tr><td colspan="2">${disc(f)}</td></tr>` : ""}</table>`,
  },
  {
    id: "premium-gold", name: "Premium (logo + social + CTA)", build: (f) =>
      `<table style="font-family:Arial,sans-serif;max-width:480px;border-collapse:collapse"><tr>
        ${f.photoUrl ? `<td style="padding-right:15px;vertical-align:top">${photo(f, 85)}</td>` : ""}
        <td style="vertical-align:top">
          <div style="color:${f.accent};font-size:16px;font-weight:700">${esc(f.name)}</div>
          <div style="font-weight:bold;font-size:12px">${esc(f.title)}</div>
          <div style="color:#666;font-size:12px">${esc(f.company)}</div>
        </td>
        <td style="padding-left:20px;font-size:12px;vertical-align:top;line-height:1.6">
          ${[f.phone, mail(f), web(f), f.address && esc(f.address)].filter(Boolean).join("<br/>")}
        </td></tr>
        <tr><td colspan="3" style="border-top:1px solid #e0e0e0;padding-top:8px">
          <table width="100%"><tr>${f.logoUrl ? `<td>${logoImg(f, 80)}</td>` : "<td></td>"}<td style="text-align:right">${socials(f)}</td></tr></table>
        </td></tr>
        ${f.ctaText && f.ctaLink ? `<tr><td colspan="3" style="padding-top:10px">${btn(f)}</td></tr>` : ""}
        ${f.disclaimer ? `<tr><td colspan="3">${disc(f)}</td></tr>` : ""}</table>`,
  },
  {
    id: "modern", name: "Modern Split", build: (f) =>
      `<table style="font-family:Helvetica,Arial,sans-serif;border-collapse:collapse"><tr>
        ${f.photoUrl || f.logoUrl ? `<td style="padding-right:16px;border-right:2px solid ${f.accent};vertical-align:middle">${f.photoUrl ? photo(f, 64) : logoImg(f, 64)}</td>` : ""}
        <td style="padding-left:16px"><div style="font-weight:700;font-size:16px;color:${f.accent}">${esc(f.name)}</div>
        <div style="font-size:13px;color:#444">${sub(f)}</div>
        <div style="font-size:12px;color:#666;margin-top:6px">${[f.phone, web(f), mail(f)].filter(Boolean).join("  •  ")}</div>
        ${socials(f) ? `<div style="margin-top:6px">${socials(f)}</div>` : ""}</td></tr></table>`,
  },
  {
    id: "bold", name: "Bold Name", build: (f) =>
      `<table style="font-family:Arial,sans-serif;border-collapse:collapse"><tr><td>
        <div style="font-weight:800;font-size:20px;color:${f.accent};letter-spacing:-.5px">${esc(f.name)}</div>
        <div style="font-size:13px;color:#555;text-transform:uppercase;letter-spacing:1px">${sub(f)}</div>
        <div style="height:2px;width:48px;background:${f.accent};margin:8px 0"></div>
        <div style="font-size:13px;color:#555">${[f.phone, web(f), mail(f)].filter(Boolean).join(" &nbsp;|&nbsp; ")}</div></td></tr></table>`,
  },
  {
    id: "corporate", name: "Corporate Serif", build: (f) =>
      `<table style="font-family:Georgia,serif;border-collapse:collapse"><tr>
        ${f.logoUrl ? `<td style="padding-right:16px;vertical-align:middle">${logoImg(f, 72)}</td>` : ""}
        <td><div style="font-weight:700;font-size:16px;color:#1a1a1a">${esc(f.name)}</div>
        <div style="font-size:13px;color:${f.accent};font-style:italic">${sub(f)}</div>
        <div style="font-size:12px;color:#555;margin-top:6px">${f.phone}${f.phone && f.email ? " · " : ""}${mail(f)}</div>
        <div style="font-size:12px">${web(f)}</div></td></tr></table>`,
  },
  {
    id: "minimal", name: "Minimal Line", build: (f) =>
      `<div style="font-family:Arial,sans-serif;font-size:13px;color:${f.textColor}"><strong style="color:#111">${esc(f.name)}</strong>${sub(f) ? ` — ${sub(f)}` : ""} ${f.phone ? `· ${f.phone}` : ""} ${f.email ? `· ${mail(f)}` : ""}</div>`,
  },
  {
    id: "social", name: "Social Stack", build: (f) =>
      `<table style="font-family:Helvetica,Arial,sans-serif;border-collapse:collapse"><tr><td>
        <div style="font-weight:700;font-size:15px;color:#111">${esc(f.name)}</div>
        <div style="font-size:13px;color:#555">${sub(f)}</div>
        <div style="font-size:12px;color:#666;margin-top:6px">${[f.phone, mail(f)].filter(Boolean).join("<br/>")}</div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee">${socials(f) || web(f)}</div></td></tr></table>`,
  },
  {
    id: "compact", name: "Compact", build: (f) =>
      `<table style="font-family:Arial,sans-serif;border-collapse:collapse"><tr>${f.logoUrl ? `<td style="padding-right:10px;vertical-align:middle">${logoImg(f, 40)}</td>` : ""}<td>
        <span style="font-weight:700;font-size:14px;color:#111">${esc(f.name)}</span> <span style="font-size:12px;color:#888">| ${sub(f)}</span><br/>
        <span style="font-size:12px;color:#666">${[f.phone, web(f)].filter(Boolean).join(" · ")}</span></td></tr></table>`,
  },
  {
    id: "elegant", name: "Elegant Serif", build: (f) =>
      `<table style="font-family:'Times New Roman',Georgia,serif;border-collapse:collapse"><tr><td>
        <div style="font-size:18px;color:#222">${esc(f.name)}</div>
        <div style="font-size:13px;color:${f.accent};border-bottom:1px solid ${f.accent};display:inline-block;padding-bottom:2px">${sub(f)}</div>
        <div style="font-size:12px;color:#555;margin-top:8px">${[f.phone, mail(f), web(f)].filter(Boolean).join("&nbsp; · &nbsp;")}</div></td></tr></table>`,
  },
];

type Mode = "design" | "html" | "rich";

// Fields grouped for the editor UI.
const FIELD_GROUPS: { group: string; fields: { k: keyof SigFields; label: string; type?: string }[] }[] = [
  { group: "Identity", fields: [
    { k: "name", label: "Full name" }, { k: "title", label: "Job title" },
    { k: "company", label: "Company" }, { k: "department", label: "Department" },
  ] },
  { group: "Contact", fields: [
    { k: "phone", label: "Phone" }, { k: "phone2", label: "Phone 2 / Mobile" },
    { k: "email", label: "Email" }, { k: "website", label: "Website" },
    { k: "address", label: "Address" },
  ] },
  { group: "Media", fields: [
    { k: "photoUrl", label: "Profile photo URL" }, { k: "logoUrl", label: "Company logo URL" },
    { k: "bannerUrl", label: "Banner image URL" }, { k: "bannerLink", label: "Banner link URL" },
  ] },
  { group: "Social links", fields: [
    { k: "linkedin", label: "LinkedIn URL" }, { k: "twitter", label: "X / Twitter URL" },
    { k: "facebook", label: "Facebook URL" }, { k: "instagram", label: "Instagram URL" },
  ] },
  { group: "Call to action", fields: [
    { k: "ctaText", label: "Button text" }, { k: "ctaLink", label: "Button link URL" },
  ] },
  { group: "Legal", fields: [
    { k: "disclaimer", label: "Disclaimer / confidentiality text" },
  ] },
];

export function SignatureDesigner() {
  const qc = useQueryClient();
  const [tpl, setTpl] = useState<Tpl>(TEMPLATES[0]!);
  const [f, setF] = useState<SigFields>(DEFAULTS);
  const [mode, setMode] = useState<Mode>("design");
  const [customHtml, setCustomHtml] = useState<string>("");
  const [dirty, setDirty] = useState(false); // custom editors diverged from the designed template
  const richRef = useRef<HTMLDivElement>(null);

  const set = (k: keyof SigFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const designedHtml = useMemo(() => tpl.build(f), [tpl, f]);
  const html = mode === "design" ? designedHtml : customHtml;

  // Switch into a custom editor — seed it from the current design unless the user already edited.
  function enterCustom(next: Mode) {
    if (!dirty || !customHtml) {
      setCustomHtml(designedHtml);
      if (next === "rich") setTimeout(() => { if (richRef.current) richRef.current.innerHTML = designedHtml; }, 20);
    } else if (next === "rich") {
      setTimeout(() => { if (richRef.current) richRef.current.innerHTML = customHtml; }, 20);
    }
    setMode(next);
  }
  function backToDesign() {
    if (dirty && !confirm("Switch back to template mode? Your custom HTML edits will be discarded.")) return;
    setDirty(false);
    setCustomHtml("");
    setMode("design");
  }
  const exec = (cmd: string, value?: string) => { document.execCommand(cmd, false, value); richRef.current?.focus(); };

  const save = useMutation({
    mutationFn: () => wmSaveSettings({ signatureHtml: html }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wm", "settings"] }); toast.success("Signature saved."); },
  });

  const TabBtn = ({ m, icon: Icon, label }: { m: Mode; icon: typeof Type; label: string }) => (
    <button
      onClick={() => (m === "design" ? backToDesign() : enterCustom(m))}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        mode === m ? "bg-primary text-white" : "text-text-secondary hover:bg-elevated",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><PenTool className="h-4 w-4" /> Signature Designer</span>
          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            <TabBtn m="design" icon={LayoutTemplate} label="Templates" />
            <TabBtn m="rich" icon={Type} label="Rich text" />
            <TabBtn m="html" icon={Code2} label="HTML" />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "design" && (
          <>
            <div>
              <Label>Choose a template ({TEMPLATES.length})</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTpl(t)}
                    className={cn(
                      "relative rounded-md border p-2 text-left text-xs transition-colors",
                      tpl.id === t.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50",
                    )}
                  >
                    {tpl.id === t.id && <Check className="absolute right-1 top-1 h-3 w-3" />}
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {FIELD_GROUPS.map((g) => (
                <div key={g.group}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">{g.group}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {g.fields.map((fld) =>
                      fld.k === "disclaimer" ? (
                        <div key={fld.k} className="col-span-2">
                          <Label htmlFor={fld.k}>{fld.label}</Label>
                          <textarea
                            id={fld.k}
                            value={f[fld.k]}
                            onChange={set(fld.k)}
                            rows={2}
                            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                        </div>
                      ) : (
                        <div key={fld.k}>
                          <Label htmlFor={fld.k}>{fld.label}</Label>
                          <Input id={fld.k} value={f[fld.k]} onChange={set(fld.k)} />
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <div>
                  <Label htmlFor="accent">Accent</Label>
                  <Input id="accent" type="color" value={f.accent} onChange={set("accent")} className="h-10 w-16 p-1" />
                </div>
                <div>
                  <Label htmlFor="textColor">Text color</Label>
                  <Input id="textColor" type="color" value={f.textColor} onChange={set("textColor")} className="h-10 w-16 p-1" />
                </div>
              </div>
            </div>
          </>
        )}

        {mode === "html" && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>Raw HTML — full control</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setCustomHtml(designedHtml); setDirty(false); }}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to template
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(customHtml); toast.success("HTML copied."); }}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </div>
            </div>
            <textarea
              value={customHtml}
              onChange={(e) => { setCustomHtml(e.target.value); setDirty(true); }}
              spellCheck={false}
              rows={14}
              className="w-full rounded-md border border-border bg-elevated px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="mt-1 text-xs text-text-secondary">Paste any HTML (e.g. exported from another tool). Inline styles only — external CSS is stripped by most email clients.</p>
          </div>
        )}

        {mode === "rich" && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>Rich text editor</Label>
              <Button variant="ghost" size="sm" onClick={() => { if (richRef.current) richRef.current.innerHTML = designedHtml; setCustomHtml(designedHtml); setDirty(false); }}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset to template
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-b-0 border-border bg-elevated px-2 py-1">
              <select onChange={(e) => exec("fontName", e.target.value)} className="h-7 rounded border border-border bg-surface px-1 text-xs" defaultValue="">
                <option value="" disabled>Font</option><option value="Arial">Sans</option><option value="Georgia">Serif</option><option value="Courier New">Mono</option>
              </select>
              <button onClick={() => exec("bold")} title="Bold" className="rounded p-1.5 hover:bg-surface"><Bold className="h-4 w-4" /></button>
              <button onClick={() => exec("italic")} title="Italic" className="rounded p-1.5 hover:bg-surface"><Italic className="h-4 w-4" /></button>
              <button onClick={() => exec("underline")} title="Underline" className="rounded p-1.5 hover:bg-surface"><Underline className="h-4 w-4" /></button>
              <label title="Text color" className="cursor-pointer rounded p-1.5 hover:bg-surface"><Type className="h-4 w-4" /><input type="color" className="hidden" onChange={(e) => exec("foreColor", e.target.value)} /></label>
              <button onClick={() => exec("insertUnorderedList")} title="Bullets" className="rounded p-1.5 hover:bg-surface"><List className="h-4 w-4" /></button>
              <button onClick={() => { const u = prompt("Link URL"); if (u) exec("createLink", norm(u)); }} title="Link" className="rounded p-1.5 hover:bg-surface"><Link2 className="h-4 w-4" /></button>
              <button onClick={() => { const u = prompt("Image URL"); if (u) exec("insertImage", u); }} title="Image" className="rounded p-1.5 hover:bg-surface"><Eye className="h-4 w-4" /></button>
            </div>
            <div
              ref={richRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => { setCustomHtml((e.target as HTMLDivElement).innerHTML); setDirty(true); }}
              className="min-h-[10rem] rounded-b-md border border-border bg-white px-4 py-3 text-sm text-black focus:outline-none"
            />
          </div>
        )}

        <div>
          <Label className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Live preview</Label>
          <div className="overflow-auto rounded-md border border-border bg-white p-4" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save as my signature</Button>
          <span className="text-xs text-text-secondary">Used automatically when you click “Insert signature” in Compose.</span>
        </div>
      </CardContent>
    </Card>
  );
}

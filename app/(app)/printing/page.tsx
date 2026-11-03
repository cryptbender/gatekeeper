"use client";

import { useMemo, useState } from "react";
import JSZip from "jszip";
import { FileArchive, FileText, Printer, Search } from "lucide-react";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { useApp } from "@/components/app-provider";
import { SheetPreview } from "@/components/printing/preview";
import { Avatar } from "@/components/guests/shared";
import { LAYOUTS, buildWristbandPdf, type Layout } from "@/lib/pdf";
import { qrDataUrl } from "@/lib/qr";
import { dataUrlToBlob, downloadBlob, safeFilename, shortTicketId, cn } from "@/lib/utils";
import type { GuestRow } from "@/lib/types";

export default function PrintingPage() {
  const { event, guests, toast } = useApp();
  const [layout, setLayout] = useState<Layout>("strip");
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState<null | "pdf" | "print" | "zip" | "one">(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [find, setFind] = useState("");

  const categories = useMemo(() => Array.from(new Set(guests.map((g) => g.category).filter(Boolean) as string[])).sort(), [guests]);
  const selected = useMemo(() => guests.filter((g) => g.ticket_status === "active").filter((g) => {
    if (scope === "all") return true;
    if (scope === "pending") return !g.checked_in_at;
    return (g.category ?? "") === scope.slice(4);
  }), [guests, scope]);
  const matches = useMemo(() => {
    const s = find.trim().toLowerCase();
    return s ? guests.filter((g) => g.ticket_status === "active" && g.full_name.toLowerCase().includes(s)).slice(0, 5) : [];
  }, [guests, find]);

  if (!event) return null;
  const sheets = Math.ceil(selected.length / LAYOUTS[layout].perPage);
  const base = safeFilename(event.name);

  async function makePdf(list: GuestRow[]) {
    setProgress([0, list.length]);
    try { return await buildWristbandPdf({ layout, event: event!, guests: list, onProgress: (d, t) => setProgress([d, t]) }); }
    finally { setProgress(null); }
  }

  async function run(kind: "pdf" | "print" | "one", list: GuestRow[], name: string) {
    if (!list.length) return;
    setBusy(kind);
    try {
      const blob = await makePdf(list);
      if (kind === "print") {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank");
        if (!w) { downloadBlob(blob, name); toast({ kind: "info", title: "Pop-up blocked", body: "The PDF was downloaded instead — open it to print." }); }
        else toast({ kind: "info", title: "PDF opened", body: "Print at 100% / “Actual size”. Do not use “Fit to page”." });
      } else downloadBlob(blob, name);
    } catch (e) { toast({ kind: "error", title: "Could not build PDF", body: e instanceof Error ? e.message : undefined }); }
    finally { setBusy(null); }
  }

  async function zipAll() {
    setBusy("zip");
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      for (let i = 0; i < selected.length; i++) {
        const g = selected[i];
        let n = `${safeFilename(g.full_name)}_${shortTicketId(g.qr_token)}.png`;
        while (used.has(n)) n = "x_" + n;
        used.add(n);
        zip.file(n, dataUrlToBlob(await qrDataUrl(g.qr_token, 1000)));
        setProgress([i + 1, selected.length]);
        if (i % 15 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      downloadBlob(await zip.generateAsync({ type: "blob", compression: "STORE" }), `${base}_QR_codes.zip`);
    } catch (e) { toast({ kind: "error", title: "Could not build ZIP", body: e instanceof Error ? e.message : undefined }); }
    finally { setBusy(null); setProgress(null); }
  }

  return (
    <>
      <PageHeader title="QR printing" description="Wristband strips and ticket cards on A4. Black QR on white with the required quiet zone." />

      {guests.length === 0 ? (
        <Card><EmptyState icon={<Printer className="h-5 w-5" />} title="Nothing to print yet" body="Add guests first — each one gets a unique QR ticket." /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Layout</h2>
              <div className="grid gap-2">
                {(Object.keys(LAYOUTS) as Layout[]).map((k) => (
                  <button key={k} onClick={() => setLayout(k)} className={cn("rounded-xl border px-4 py-3 text-left transition", layout === k ? "border-accent bg-accent/5 ring-2 ring-accent/20" : "hover:bg-subtle")}>
                    <p className="text-sm font-medium">{LAYOUTS[k].label}</p><p className="text-xs text-muted">{LAYOUTS[k].hint}</p>
                  </button>
                ))}
              </div>
              <h2 className="mb-2 mt-5 text-sm font-semibold">Guests to include</h2>
              <Select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">All active tickets</option><option value="pending">Not entered yet</option>
                {categories.map((c) => <option key={c} value={`cat:${c}`}>Category: {c}</option>)}
              </Select>
              <p className="mt-2 text-xs text-muted">Revoked tickets are never printed.</p>
            </Card>

            <Card className="p-5">
              <p className="text-sm"><span className="font-semibold tabular-nums">{selected.length.toLocaleString()}</span> ticket{selected.length === 1 ? "" : "s"} · <span className="tabular-nums">{sheets}</span> A4 sheet{sheets === 1 ? "" : "s"}</p>
              <div className="mt-4 grid gap-2">
                <Button variant="primary" size="lg" loading={busy === "pdf"} disabled={!selected.length || busy !== null} onClick={() => void run("pdf", selected, `${base}_${layout === "strip" ? "wristbands" : "tickets"}.pdf`)}><FileText className="h-4 w-4" />Download PDF</Button>
                <Button size="lg" loading={busy === "print"} disabled={!selected.length || busy !== null} onClick={() => void run("print", selected, `${base}_${layout}.pdf`)}><Printer className="h-4 w-4" />Open for printing</Button>
                <Button size="lg" loading={busy === "zip"} disabled={!selected.length || busy !== null} onClick={() => void zipAll()}><FileArchive className="h-4 w-4" />All QR images (ZIP)</Button>
              </div>
              {progress && (
                <div className="mt-4"><div className="h-1.5 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} /></div>
                  <p className="mt-1 text-xs tabular-nums text-muted">{progress[0]} / {progress[1]}</p></div>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Print one ticket</h2>
              <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="pl-10" placeholder="Search guest name" value={find} onChange={(e) => setFind(e.target.value)} /></div>
              {matches.length > 0 && (
                <ul className="mt-2 divide-y rounded-xl border">
                  {matches.map((g) => (
                    <li key={g.id} className="flex items-center gap-3 p-2.5">
                      <Avatar name={g.full_name} className="h-8 w-8" /><span className="min-w-0 flex-1 truncate text-sm">{g.full_name}</span>
                      <Button size="sm" loading={busy === "one"} disabled={busy !== null} onClick={() => void run("one", [g], `${safeFilename(g.full_name)}_${layout}.pdf`)}>Download</Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Print preview · sheet 1</h2><span className="text-xs text-muted">A4 · actual proportions</span></div>
            <SheetPreview layout={layout} event={event} guests={selected} />
            <p className="mt-3 text-xs text-muted">Print at 100% scale. The preview mirrors the PDF layout; the PDF is the file to print. Do a test print and scan one wristband before printing the full batch.</p>
          </div>
        </div>
      )}
    </>
  );
}

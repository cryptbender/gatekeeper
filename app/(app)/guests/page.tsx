"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Download, FileDown, Pencil, QrCode, Search, Trash2, UploadCloud, UserPlus, Users } from "lucide-react";
import { Button, Card, EmptyState, Input, Modal, PageHeader, Select } from "@/components/ui";
import { useApp } from "@/components/app-provider";
import { Avatar, QrImage, StatsRow, StatusBadge } from "@/components/guests/shared";
import { GuestFormModal } from "@/components/guests/guest-form";
import { ImportModal } from "@/components/guests/import-modal";
import { QrModal } from "@/components/guests/qr-modal";
import { store } from "@/lib/data";
import { entryStatus, type GuestRow } from "@/lib/types";
import { guestsToCsvBlob, guestsToXlsxBlob } from "@/lib/exporter";
import { qrDataUrl } from "@/lib/qr";
import { dataUrlToBlob, downloadBlob, safeFilename, shortTicketId } from "@/lib/utils";
import { fmtTime } from "@/lib/time";

const PAGE_SIZE = 50;

export default function GuestsPage() {
  const { event, guests, guestsLoading, refreshGuests, toast } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GuestRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [qrGuest, setQrGuest] = useState<GuestRow | null>(null);
  const [deleting, setDeleting] = useState<GuestRow | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => setPage(0), [q, cat, status]);

  const categories = useMemo(() => Array.from(new Set(guests.map((g) => g.category).filter(Boolean) as string[])).sort(), [guests]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    return guests.filter((g) => {
      if (cat !== "all" && (g.category ?? "") !== (cat === "none" ? "" : cat)) return false;
      if (status !== "all" && entryStatus(g) !== status) return false;
      if (!s) return true;
      return g.full_name.toLowerCase().includes(s) || (g.email ?? "").toLowerCase().includes(s) ||
        (digits.length >= 3 && (g.phone ?? "").replace(/\D/g, "").includes(digits)) || (g.phone ?? "").includes(s);
    });
  }, [guests, q, cat, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const liveQr = qrGuest ? guests.find((g) => g.id === qrGuest.id) ?? null : null;

  if (!event) return null;
  const tz = event.timezone;

  async function saveGuest(v: { full_name: string; phone?: string | null; email?: string | null; category?: string | null }) {
    if (editing) {
      await store.updateGuest(editing.id, v);
      toast({ kind: "success", title: "Guest updated" });
    } else {
      await store.addGuests(event!.id, [v]);
      toast({ kind: "success", title: "Guest added", body: `${v.full_name.trim()} now has a unique QR ticket.` });
    }
    setFormOpen(false); setEditing(null);
    await refreshGuests();
  }

  async function removeGuest() {
    if (!deleting) return;
    setDelBusy(true);
    try {
      await store.deleteGuests([deleting.id]);
      toast({ kind: "success", title: "Guest deleted" });
      setDeleting(null);
      await refreshGuests();
    } catch (e) { toast({ kind: "error", title: "Could not delete", body: e instanceof Error ? e.message : undefined }); }
    finally { setDelBusy(false); }
  }

  async function dlQr(g: GuestRow) {
    downloadBlob(dataUrlToBlob(await qrDataUrl(g.qr_token, 1200)), `QR_${safeFilename(g.full_name)}_${shortTicketId(g.qr_token)}.png`);
  }

  async function exportList(kind: "csv" | "xlsx") {
    setMenu(false);
    const base = safeFilename(event!.name) + "_guests";
    try {
      if (kind === "csv") downloadBlob(guestsToCsvBlob(guests, tz), base + ".csv");
      else downloadBlob(await guestsToXlsxBlob(guests, tz), base + ".xlsx");
    } catch (e) { toast({ kind: "error", title: "Export failed", body: e instanceof Error ? e.message : undefined }); }
  }

  const act = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); await refreshGuests(); toast({ kind: "success", title: label }); }
    catch (e) { toast({ kind: "error", title: "Action failed", body: e instanceof Error ? e.message : undefined }); }
  };

  return (
    <>
      <PageHeader title="Guest list" description={`${event.name} · every guest gets one unique QR ticket`}
        actions={
          <div ref={menuRef} className="relative">
            <Button onClick={() => setMenu((v) => !v)} disabled={!guests.length}><FileDown className="h-4 w-4" />Export<ChevronDown className="h-3.5 w-3.5 text-muted" /></Button>
            <AnimatePresence>
              {menu && (
                <motion.div initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.12 }}
                  className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border bg-surface p-1 shadow-pop">
                  {([["csv", "CSV (.csv)"], ["xlsx", "Excel (.xlsx)"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => void exportList(k)} className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle">{l}</button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        } />

      {/* The two ways to add guests */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {[
          { icon: UserPlus, title: "Add guest manually", body: "Register one guest and generate their QR instantly.", onClick: () => { setEditing(null); setFormOpen(true); }, primary: true },
          { icon: UploadCloud, title: "Upload guest list", body: "Import a CSV or Excel file with column mapping and preview.", onClick: () => setImportOpen(true), primary: false },
        ].map((o) => (
          <button key={o.title} onClick={o.onClick} className="group flex items-center gap-4 rounded-2xl border bg-surface p-4 text-left shadow-card transition hover:border-accent/50 hover:shadow-pop active:scale-[0.99] sm:p-5">
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition ${o.primary ? "bg-accent text-accent-ink" : "bg-accent/10 text-accent"}`}><o.icon className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="text-sm font-semibold">{o.title}</p><p className="text-[13px] text-muted">{o.body}</p></div>
          </button>
        ))}
      </div>

      <StatsRow guests={guests} loading={guestsLoading && guests.length === 0} />

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-10" placeholder="Search name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search guests" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select className="sm:w-40" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              {guests.some((g) => !g.category) && <option value="none">Uncategorized</option>}
            </Select>
            <Select className="sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by entry status">
              <option value="all">All statuses</option><option value="NOT_ENTERED">Not entered</option><option value="ENTERED">Entered</option><option value="REVOKED">Revoked</option>
            </Select>
          </div>
        </div>

        {guests.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No guests yet" body="Add a guest manually or upload a spreadsheet to generate QR tickets."
            action={<div className="flex gap-2"><Button variant="primary" onClick={() => setFormOpen(true)}><UserPlus className="h-4 w-4" />Add guest</Button><Button onClick={() => setImportOpen(true)}><UploadCloud className="h-4 w-4" />Upload</Button></div>} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Search className="h-5 w-5" />} title="No matching guests" body="Try a different search or clear the filters." action={<Button onClick={() => { setQ(""); setCat("all"); setStatus("all"); }}>Clear filters</Button>} />
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-subtle/50 text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Guest</th><th className="px-3 py-3 font-medium">Category</th><th className="px-3 py-3 font-medium">QR code</th><th className="px-3 py-3 font-medium">Entry status</th><th className="px-5 py-3" />
                </tr></thead>
                <tbody>
                  {visible.map((g) => (
                    <tr key={g.id} className="border-b last:border-0 transition hover:bg-subtle/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3"><Avatar name={g.full_name} />
                          <div className="min-w-0"><p className="truncate font-medium">{g.full_name}</p><p className="truncate text-[13px] text-muted">{[g.phone, g.email].filter(Boolean).join(" · ") || "No contact details"}</p></div></div>
                      </td>
                      <td className="px-3 py-3 text-muted">{g.category ?? "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setQrGuest(g)}><QrCode className="h-4 w-4" />View</Button>
                          <Button size="sm" variant="ghost" onClick={() => void dlQr(g)} aria-label={`Download QR for ${g.full_name}`}><Download className="h-4 w-4" /></Button>
                        </div>
                      </td>
                      <td className="px-3 py-3"><div className="flex flex-col items-start gap-1"><StatusBadge g={g} />{g.checked_in_at && <span className="text-xs text-muted">{fmtTime(g.checked_in_at, tz)}</span>}</div></td>
                      <td className="px-5 py-3"><div className="flex justify-end gap-0.5">
                        <Button size="sm" variant="ghost" aria-label={`Edit ${g.full_name}`} onClick={() => { setEditing(g); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" aria-label={`Delete ${g.full_name}`} className="hover:text-danger" onClick={() => setDeleting(g)}><Trash2 className="h-4 w-4" /></Button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y md:hidden">
              {visible.map((g) => (
                <li key={g.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={g.full_name} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><p className="truncate font-medium">{g.full_name}</p><StatusBadge g={g} /></div>
                      <p className="truncate text-[13px] text-muted">{g.category ?? "General"}{g.checked_in_at ? ` · in at ${fmtTime(g.checked_in_at, tz)}` : ""}</p>
                      <p className="truncate text-[13px] text-muted">{[g.phone, g.email].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" className="flex-1" onClick={() => setQrGuest(g)}><QrCode className="h-4 w-4" />View QR</Button>
                    <Button size="sm" onClick={() => void dlQr(g)} aria-label="Download QR"><Download className="h-4 w-4" /></Button>
                    <Button size="sm" onClick={() => { setEditing(g); setFormOpen(true); }} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" onClick={() => setDeleting(g)} aria-label="Delete" className="text-danger"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t px-4 py-3 text-[13px] text-muted sm:px-5">
              <span>{filtered.length.toLocaleString()} guest{filtered.length === 1 ? "" : "s"}{filtered.length !== guests.length && ` of ${guests.length.toLocaleString()}`}</span>
              {pages > 1 && (
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                  <span className="tabular-nums">{page + 1} / {pages}</span>
                  <Button size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      <GuestFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} guest={editing} categories={categories} onSave={saveGuest} />
      <ImportModal open={importOpen} onClose={() => { setImportOpen(false); void refreshGuests(); }} existing={guests}
        onImport={async (list, onProgress) => {
          let done = 0;
          for (let i = 0; i < list.length; i += 300) {
            const chunk = list.slice(i, i + 300);
            done += await store.addGuests(event.id, chunk);
            onProgress(Math.min(i + chunk.length, list.length));
            await new Promise((r) => setTimeout(r, 0));
          }
          await refreshGuests();
          return done;
        }} />
      <QrModal guest={liveQr} tz={tz} onClose={() => setQrGuest(null)}
        onRevoke={(g) => act("QR revoked", () => store.setTicketStatus(g.ticket_id, "revoked"))}
        onRestore={(g) => act("QR restored", () => store.setTicketStatus(g.ticket_id, "active"))}
        onRegenerate={(g) => act("New QR issued", () => store.regenerateTicket(g.ticket_id))} />

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete guest?" description={deleting ? deleting.full_name : undefined}
        footer={<><Button onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" loading={delBusy} onClick={() => void removeGuest()}>Delete guest</Button></>}>
        <p className="text-sm text-muted">Their QR code stops working immediately.{deleting?.checked_in_at ? " This guest has already entered; deleting also removes their entry record." : ""}</p>
        {deleting && <div className="mt-4 flex justify-center"><QrImage token={deleting.qr_token} size={120} className="opacity-60" /></div>}
      </Modal>
    </>
  );
}

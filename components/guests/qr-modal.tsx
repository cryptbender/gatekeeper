"use client";

import { useState } from "react";
import { Ban, Check, Download, RefreshCw, RotateCcw, Undo2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { QrImage, SERVICE_ICON, StatusBadge } from "./shared";
import { SERVICES, SERVICE_LABEL, serviceTime, type GuestRow, type Service } from "@/lib/types";
import { qrDataUrl } from "@/lib/qr";
import { cn, dataUrlToBlob, downloadBlob, safeFilename, shortTicketId } from "@/lib/utils";
import { fmtDateTime } from "@/lib/time";

export function QrModal({ guest, tz, onClose, onRevoke, onRestore, onRegenerate, onUndo }: {
  guest: GuestRow | null; tz: string; onClose: () => void;
  onRevoke: (g: GuestRow) => Promise<void>; onRestore: (g: GuestRow) => Promise<void>; onRegenerate: (g: GuestRow) => Promise<void>;
  onUndo: (g: GuestRow, s: Service) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); try { await fn(); } finally { setBusy(null); } };
  const entered = Boolean(guest?.checked_in_at);

  async function download() {
    if (!guest) return;
    const url = await qrDataUrl(guest.qr_token, 1200);
    downloadBlob(dataUrlToBlob(url), `QR_${safeFilename(guest.full_name)}_${shortTicketId(guest.qr_token)}.png`);
  }

  return (
    <Modal open={Boolean(guest)} onClose={onClose} title={guest?.full_name ?? ""} description={guest ? `${guest.category ?? "General"} · Ticket ${shortTicketId(guest.qr_token)}` : undefined}>
      {guest && (
        <div className="flex flex-col items-center">
          <div className="rounded-2xl border bg-white p-1 shadow-card"><QrImage token={guest.qr_token} size={240} /></div>
          <div className="mt-3"><StatusBadge g={guest} /></div>

          <ul className="mt-4 w-full divide-y rounded-xl border">
            {SERVICES.map((sv) => {
              const t = serviceTime(guest, sv); const Ic = SERVICE_ICON[sv];
              const blocked = sv === "entry" && Boolean(guest.lunch_at || guest.dinner_at);
              return (
                <li key={sv} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", t ? "bg-ok/10 text-ok" : "bg-subtle text-muted")}>{t ? <Check className="h-4 w-4" /> : <Ic className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{SERVICE_LABEL[sv]}</p><p className="truncate text-xs text-muted">{t ? fmtDateTime(t, tz) : "Not yet"}</p></div>
                  {t && <Button size="sm" variant="ghost" disabled={blocked} title={blocked ? "Undo lunch and dinner first" : "Remove this record (admin correction)"} loading={busy === "undo" + sv} onClick={() => void run("undo" + sv, () => onUndo(guest, sv))}><Undo2 className="h-3.5 w-3.5" />Undo</Button>}
                </li>
              );
            })}
          </ul>

          <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
            <Button variant="primary" className="sm:col-span-2" onClick={() => void download()}><Download className="h-4 w-4" />Download PNG</Button>
            {!entered && guest.ticket_status === "active" && (
              <Button loading={busy === "revoke"} onClick={() => void run("revoke", () => onRevoke(guest))}><Ban className="h-4 w-4" />Revoke QR</Button>
            )}
            {!entered && guest.ticket_status === "revoked" && (
              <Button loading={busy === "restore"} onClick={() => void run("restore", () => onRestore(guest))}><RotateCcw className="h-4 w-4" />Restore QR</Button>
            )}
            {!entered && (
              <Button loading={busy === "regen"} onClick={() => void run("regen", () => onRegenerate(guest))}><RefreshCw className="h-4 w-4" />Regenerate</Button>
            )}
          </div>
          {!entered && <p className="mt-3 text-center text-xs text-muted">Regenerating issues a new code; the old wristband stops working immediately.</p>}
        </div>
      )}
    </Modal>
  );
}

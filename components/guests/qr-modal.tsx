"use client";

import { useState } from "react";
import { Ban, Download, RefreshCw, RotateCcw } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { QrImage, StatusBadge } from "./shared";
import type { GuestRow } from "@/lib/types";
import { qrDataUrl } from "@/lib/qr";
import { dataUrlToBlob, downloadBlob, safeFilename, shortTicketId } from "@/lib/utils";
import { fmtDateTime } from "@/lib/time";

export function QrModal({ guest, tz, onClose, onRevoke, onRestore, onRegenerate }: {
  guest: GuestRow | null; tz: string; onClose: () => void;
  onRevoke: (g: GuestRow) => Promise<void>; onRestore: (g: GuestRow) => Promise<void>; onRegenerate: (g: GuestRow) => Promise<void>;
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
          <div className="rounded-2xl border bg-white p-1 shadow-card"><QrImage token={guest.qr_token} size={256} /></div>
          <div className="mt-4 flex items-center gap-2">
            <StatusBadge g={guest} />
            {guest.checked_in_at && <span className="text-xs text-muted">{fmtDateTime(guest.checked_in_at, tz)}</span>}
          </div>
          <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
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

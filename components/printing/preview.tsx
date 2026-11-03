"use client";

import { useEffect, useRef, useState } from "react";
import { QrImage } from "@/components/guests/shared";
import type { EventRow, GuestRow } from "@/lib/types";
import type { Layout } from "@/lib/pdf";
import { shortTicketId } from "@/lib/utils";

const PX_PER_MM = 96 / 25.4;
const W = 210 * PX_PER_MM, H = 297 * PX_PER_MM;
const mm = (v: number) => v * PX_PER_MM;

/** Scaled HTML replica of page 1 of the generated PDF (same mm geometry as lib/pdf.ts). */
export function SheetPreview({ layout, event, guests }: { layout: Layout; event: EventRow; guests: GuestRow[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / W)));
    ro.observe(el); setScale(Math.min(1, el.clientWidth / W));
    return () => ro.disconnect();
  }, []);
  const page = guests.slice(0, 8);

  return (
    <div ref={wrap} className="w-full" style={{ height: H * scale }}>
      <div className="origin-top-left overflow-hidden rounded-sm border bg-white text-black shadow-card" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {page.map((g, i) => layout === "strip" ? (
          <div key={g.id} className="absolute flex items-center rounded-[2mm] border border-dashed border-neutral-400"
            style={{ left: mm(10), top: mm(12 + i * 34), width: mm(190), height: mm(30) }}>
            <div style={{ marginLeft: mm(2) }}><QrImage token={g.qr_token} size={mm(26)} className="rounded-none" /></div>
            <div className="min-w-0 flex-1" style={{ paddingLeft: mm(6), paddingRight: mm(12) }}>
              <p className="truncate font-bold uppercase text-neutral-500" style={{ fontSize: mm(2.7) }}>{event.name}</p>
              <p className="truncate font-bold leading-tight" style={{ fontSize: mm(6) }}>{g.full_name}</p>
              <p className="truncate text-neutral-600" style={{ fontSize: mm(3.2) }}>{g.category ?? "General"} · ID {shortTicketId(g.qr_token)}</p>
            </div>
            <div className="absolute inset-y-[1mm] border-l border-neutral-300" style={{ right: mm(10) }} />
          </div>
        ) : (
          <div key={g.id} className="absolute rounded-[2.5mm] border border-dashed border-neutral-400"
            style={{ left: mm(10 + (i % 2) * 100), top: mm(14 + Math.floor(i / 2) * 66), width: mm(90), height: mm(62) }}>
            <div className="absolute" style={{ left: mm(3), top: mm(3) }}><QrImage token={g.qr_token} size={mm(36)} className="rounded-none" /></div>
            <div className="absolute" style={{ left: mm(46), top: mm(5), right: mm(4) }}>
              <p className="truncate font-bold uppercase text-neutral-500" style={{ fontSize: mm(2.5) }}>{event.name}</p>
              <p className="truncate font-bold" style={{ fontSize: mm(3.8), marginTop: mm(1) }}>{g.category ?? "General"}</p>
              <p className="text-neutral-600" style={{ fontSize: mm(3) }}>ID {shortTicketId(g.qr_token)}</p>
            </div>
            <p className="absolute truncate font-bold" style={{ left: mm(5), right: mm(5), top: mm(40), fontSize: mm(5.4) }}>{g.full_name}</p>
          </div>
        ))}
        {page.length === 0 && <p className="grid h-full place-items-center text-sm text-neutral-400">No tickets selected</p>}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Badge, Card, Skeleton } from "@/components/ui";
import { entryStatus, type GuestRow } from "@/lib/types";
import { cachedQr } from "@/lib/qr";
import { cn, initials } from "@/lib/utils";

export function StatusBadge({ g }: { g: Pick<GuestRow, "checked_in_at" | "ticket_status"> }) {
  const s = entryStatus(g);
  if (s === "ENTERED") return <Badge tone="ok"><span className="h-1.5 w-1.5 rounded-full bg-ok" />Entered</Badge>;
  if (s === "REVOKED") return <Badge tone="danger"><span className="h-1.5 w-1.5 rounded-full bg-danger" />Revoked</Badge>;
  return <Badge><span className="h-1.5 w-1.5 rounded-full bg-muted/60" />Not entered</Badge>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent", className)}>{initials(name)}</div>;
}

export function useStats(guests: GuestRow[]) {
  return useMemo(() => {
    const total = guests.length;
    const entered = guests.filter((g) => g.checked_in_at).length;
    return { total, entered, notEntered: total - entered, pct: total ? Math.round((entered / total) * 100) : 0 };
  }, [guests]);
}

export function StatsRow({ guests, loading }: { guests: GuestRow[]; loading?: boolean }) {
  const s = useStats(guests);
  const items = [
    { label: "Total guests", value: s.total.toLocaleString(), tone: "" },
    { label: "Entered", value: s.entered.toLocaleString(), tone: "text-ok" },
    { label: "Not entered", value: s.notEntered.toLocaleString(), tone: "" },
    { label: "Entry rate", value: `${s.pct}%`, tone: "text-accent" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it, i) => (
        <motion.div key={it.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.25 }}>
          <Card className="p-4 sm:p-5">
            <p className="text-[13px] text-muted">{it.label}</p>
            {loading ? <Skeleton className="mt-2 h-8 w-16" /> : (
              <motion.p key={it.value} initial={{ opacity: 0.4, y: 3 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl", it.tone)}>{it.value}</motion.p>
            )}
            {it.label === "Entry rate" && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle"><motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: `${s.pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} /></div>
            )}
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

/** QR image — always black on white with its quiet zone baked in. */
export function QrImage({ token, size = 220, className }: { token: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let live = true; cachedQr(token, 900).then((u) => live && setSrc(u)); return () => { live = false; }; }, [token]);
  return (
    <div className={cn("overflow-hidden rounded-xl bg-white", className)} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} width={size} height={size} alt="Guest QR code" className="block h-full w-full" /> : <Skeleton className="h-full w-full rounded-none" />}
    </div>
  );
}
